/**
 * Generate attendance SQL that works with existing + new students
 */

const fs = require('fs');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  const attendData = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8'));

  const [sessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession');
  const [terms] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm');
  
  const sessionMap = new Map();
  sessions.forEach(s => sessionMap.set(`${s.schoolId}_${s.name}`, s));
  const termMap = new Map();
  terms.forEach(t => termMap.set(`${t.sessionId}_${t.name}`, t.id));

  // Get existing student IDs for reference
  const studentIds = [...new Set(attendData.map(r => r.studentId))];
  const placeholders = studentIds.map(() => '?').join(',');
  const [existingStudents] = await conn.execute(
    `SELECT id, studentNo FROM Student WHERE studentNo IN (${placeholders})`,
    studentIds
  );
  const studentMap = new Map();
  existingStudents.forEach(s => studentMap.set(s.studentNo, s.id));
  
  console.log(`Found ${studentMap.size} students in DB out of ${studentIds.length} needed`);

  // Create INSERT SQL for each attendance record
  const lines = [];
  let skipped = 0;
  
  for (const r of attendData) {
    const schoolId = r.studentId.startsWith('greatkings') ? 9 : 8;
    const sess = sessionMap.get(`${schoolId}_${r.session}`);
    if (!sess) { skipped++; continue; }
    
    const termId = termMap.get(`${sess.id}_${r.term.toUpperCase()}`);
    if (!termId) { skipped++; continue; }

    const present = parseNum(r.present);
    const absent = parseNum(r.absent);

    // Use subquery to get student ID (works for both existing and newly inserted)
    lines.push(
      `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) ` +
      `SELECT s.id, ${sess.id}, ${termId}, ${present}, ${absent}, '${escape(r.comment || '')}', '${escape(r.principal || '')}', NOW(), NOW() ` +
      `FROM Student s WHERE s.studentNo = '${r.studentId}' ` +
      `ON DUPLICATE KEY UPDATE present=VALUES(present)`
    );
  }

  fs.writeFileSync('migration-attendance.sql',
    `-- ATTENDANCE MIGRATION (${lines.length} records, ${skipped} skipped)\n` +
    `-- Run AFTER users/students are migrated\n\n` +
    lines.join(';\n') + ';'
  );

  console.log(`Wrote migration-attendance.sql (${lines.length} records)`);

  await conn.end();
})();

function parseNum(val) {
  if (!val || val.trim() === '' || val.toLowerCase() === 'nil' || val.toLowerCase() === 'null') return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function escape(str) {
  return (str || '').replace(/'/g, "\\'").replace(/\\r\\n/g, ' ').substring(0, 255);
}