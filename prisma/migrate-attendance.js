const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

function parseNum(val) {
  if (!val || val.trim() === '' || val.toLowerCase() === 'nil' || val.toLowerCase() === 'null' || val.trim() === '-') return 0;
  const n = parseInt(val, 10);
  return isNaN(n) ? 0 : n;
}

function escape(str) {
  return (str || '').replace(/'/g, "\\'").replace(/\\r\\n/g, ' ').substring(0, 255);
}

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  console.log('Migrating remaining attendance records...\n');

  // Use deduplicated data
  const attendData = JSON.parse(fs.readFileSync('clean-attendance-deduped.json', 'utf8'));

  const [sessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession');
  const [terms] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm');
  
  const sessionMap = new Map();
  sessions.forEach(s => sessionMap.set(`${s.schoolId}_${s.name}`, s));
  const termMap = new Map();
  terms.forEach(t => termMap.set(`${t.sessionId}_${t.name}`, t.id));

  // Get student IDs
  const studentIds = [...new Set(attendData.map(r => r.studentId))];
  const placeholders = studentIds.map(() => '?').join(',');
  const [existingStudents] = await conn.execute(
    `SELECT id, studentNo FROM Student WHERE studentNo IN (${placeholders})`,
    studentIds
  );
  const studentMap = new Map();
  existingStudents.forEach(s => studentMap.set(s.studentNo, s.id));

  // Get existing attendance keys to skip
  const [existingAtt] = await conn.execute('SELECT studentId, sessionId, termId FROM Attendance');
  const existingKeys = new Set();
  existingAtt.forEach(a => existingKeys.add(`${a.studentId}_${a.sessionId}_${a.termId}`));

  let toMigrate = 0;
  let skipped = 0;
  
  for (const r of attendData) {
    const schoolId = r.studentId.startsWith('greatkings') ? 9 : 8;
    const sess = sessionMap.get(`${schoolId}_${r.session}`);
    if (!sess) { skipped++; continue; }
    const termId = termMap.get(`${sess.id}_${r.term.toUpperCase()}`);
    if (!termId) { skipped++; continue; }
    if (!studentMap.has(r.studentId)) { skipped++; continue; }
    
    const key = `${studentMap.get(r.studentId)}_${sess.id}_${termId}`;
    if (existingKeys.has(key)) { skipped++; continue; }
    
    toMigrate++;
  }

  console.log(`Records to migrate: ${toMigrate}`);

  // Batch insert
  const batchSize = 100;
  let migrated = 0;
  
  for (let i = 0; i < attendData.length; i += batchSize) {
    const batch = attendData.slice(i, i + batchSize);
    const values = [];
    
    for (const r of batch) {
      const schoolId = r.studentId.startsWith('greatkings') ? 9 : 8;
      const sess = sessionMap.get(`${schoolId}_${r.session}`);
      if (!sess) continue;
      const termId = termMap.get(`${sess.id}_${r.term.toUpperCase()}`);
      if (!termId) continue;
      if (!studentMap.has(r.studentId)) continue;
      
      const key = `${studentMap.get(r.studentId)}_${sess.id}_${termId}`;
      if (existingKeys.has(key)) continue;

      const present = parseNum(r.present);
      const absent = parseNum(r.absent);
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

      values.push(`(${studentMap.get(r.studentId)}, ${sess.id}, ${termId}, ${present}, ${absent}, '${escape(r.comment || '')}', '${escape(r.principal || '')}', '${now}', '${now}')`);
    }

    if (values.length > 0) {
      await conn.query(
        `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES ${values.join(',')}`
      );
      migrated += values.length;
      process.stdout.write(`Progress: ${migrated}/${toMigrate}\n`);
    }
  }

  const [final] = await conn.execute('SELECT COUNT(*) as c FROM Attendance');
  console.log(`\nTotal attendance records now: ${final[0].c}`);

  await conn.end();
})();