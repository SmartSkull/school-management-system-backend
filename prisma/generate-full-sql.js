/**
 * Generate complete migration SQL - Users + Students + Attendance in one file
 */

const fs = require('fs');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

const FLORIEREN_HASH = '$2a$12$1FIJWpe8kDVwGmygHntDWOhk7vNQnClUrTXUjGsLudXAOvFnJ1Iau';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  console.log('Generating complete migration SQL...\n');

  // Get existing users
  const gkUsers = JSON.parse(fs.readFileSync('gka-users.json', 'utf8'));
  const flUsers = JSON.parse(fs.readFileSync('florieren-users.json', 'utf8'));
  const allUsers = [...gkUsers, ...flUsers];

  const [existing] = await conn.execute('SELECT uniqueId, schoolId FROM User');
  const existingIds = new Set(existing.map(u => u.uniqueId));

  // Get class mapping
  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => {
    classMap.set(c.name.toLowerCase(), c.id);
    classMap.set(c.name, c.id);
  });

  // Generate User/Student SQL
  let userLines = [];
  for (const u of allUsers) {
    if (existingIds.has(u.studentId)) continue; // Skip existing
    
    const classId = classMap.get(u.className?.toLowerCase()) || null;
    const safeFirst = (u.firstname || 'Unknown').substring(0, 100);
    const safeMiddle = (u.middlename || '').substring(0, 100);
    const safeLast = (u.lastname || 'Unknown').substring(0, 100);
    const safeFather = (u.fatherName || '').substring(0, 150);
    const safeMother = (u.motherName || '').substring(0, 150);
    
    userLines.push(
      `INSERT INTO User (uniqueId, schoolId, role, firstName, middleName, lastName, password, status) VALUES ` +
      `('${u.studentId}', ${u.schoolId}, 'STUDENT', '${safeFirst}', '${escape(safeMiddle)}', '${safeLast}', '${FLORIEREN_HASH}', 'ACTIVE'); ` +
      `SET @uid = LAST_INSERT_ID(); ` +
      `INSERT INTO Student (userId, studentNo, classRoomId, fatherName, motherName, parentImage) VALUES ` +
      `(@uid, '${u.studentId}', ${classId || 'NULL'}, '${escape(safeFather)}', '${escape(safeMother)}', '${u.parentImage || 'image.png'}');`
    );
  }

  fs.writeFileSync('full-migration-users.sql', 
    `-- FULL USER/STUDENT MIGRATION (${userLines.length} new users)\n` +
    `-- Run this file on the Railway database\n\n` +
    userLines.join('\n\n')
  );
  console.log(`Generated full-migration-users.sql with ${userLines.length} users`);

  // Now generate attendance SQL
  const attendData = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8'));

  const [sessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession');
  const sessionMap = new Map();
  sessions.forEach(s => sessionMap.set(`${s.schoolId}_${s.name}`, s));

  const [terms] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm');
  const termMap = new Map();
  terms.forEach(t => termMap.set(`${t.sessionId}_${t.name}`, t.id));

  // After user migration, we need to get new student IDs
  // For now, write a query that will work once users are inserted
  const attLines = [];
  for (const r of attendData) {
    const schoolId = r.studentId.startsWith('greatkings') ? 9 : 8;
    const sess = sessionMap.get(`${schoolId}_${r.session}`);
    if (!sess) continue;
    const termId = termMap.get(`${sess.id}_${r.term.toUpperCase()}`);
    if (!termId) continue;
    
    const present = parseNum(r.present);
    const absent = parseNum(r.absent);
    
    attLines.push(
      `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) ` +
      `SELECT s.id, ${sess.id}, ${termId}, ${present}, ${absent}, '${escape(r.comment)}', '${escape(r.principal)}', NOW(), NOW() ` +
      `FROM Student s WHERE s.studentNo = '${r.studentId}'`
    );
  }

  fs.writeFileSync('full-migration-attendance.sql',
    `-- FULL ATTENDANCE MIGRATION (${attLines.length} records)\n` +
    `-- Run AFTER users are migrated\n\n` +
    attLines.join(';\n\n') + ';'
  );
  console.log(`Generated full-migration-attendance.sql with ${attLines.length} records`);

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