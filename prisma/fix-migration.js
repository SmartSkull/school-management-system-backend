const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

function parseNumeric(val) {
  if (!val || val.trim() === '' || val.toLowerCase() === 'nil' || val.toLowerCase() === 'null' || val.trim() === '-') {
    return 0;
  }
  const parsed = parseInt(val.trim(), 10);
  return isNaN(parsed) ? 0 : parsed;
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000,
  });

  console.log('🔧 Starting complete migration...\n');

  // Get session/term mappings
  const [sessions] = await connection.execute(`SELECT id, name, schoolId FROM AcademicSession`);
  const sessionMap = new Map();
  for (const s of sessions) {
    sessionMap.set(`${s.schoolId}_${s.name}`, s);
  }

  const [terms] = await connection.execute(`SELECT id, name, sessionId FROM AcademicTerm`);
  const termMap = new Map();
  for (const t of terms) {
    termMap.set(`${t.sessionId}_${t.name}`, t.id);
  }

  // Read clean attendance data
  const allRecords = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8'));
  console.log(`Total SQL records: ${allRecords.length}`);

  // Get all Student records
  const [existingStudents] = await connection.execute(`SELECT id, studentNo FROM Student`);
  const studentMap = new Map();
  for (const s of existingStudents) {
    studentMap.set(s.studentNo, s.id);
  }
  console.log(`Students in DB: ${studentMap.size}`);

  // Process records
  const toInsert = [];
  let skippedStudent = 0;
  
  for (const record of allRecords) {
    const { studentId, present, absent, comment, principal, term, session } = record;
    
    const studentDbId = studentMap.get(studentId);
    if (!studentDbId) {
      skippedStudent++;
      continue;
    }

    const schoolId = studentId.startsWith('greatkings') ? 9 : 8;
    const sess = sessionMap.get(`${schoolId}_${session}`);
    if (!sess) continue;

    const termId = termMap.get(`${sess.id}_${term.toUpperCase()}`);
    if (!termId) continue;

    toInsert.push([studentDbId, sess.id, termId, parseNumeric(present), parseNumeric(absent), comment || '', principal || '', new Date(), new Date()]);
  }

  console.log(`To insert: ${toInsert.length}`);
  console.log(`Skipped (no student): ${skippedStudent}`);

  // Write SQL file for manual import
  const values = toInsert.map(r => `(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, '${r[5].replace(/'/g, "\\'").substring(0, 100)}', '${r[6].replace(/'/g, "\\'").substring(0, 100)}', NOW(), NOW())`).join(',\n');
  
  fs.writeFileSync('attendance-insert.sql', `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES\n${values};\n`);
  console.log('\nWrote attendance-insert.sql - run this manually if needed');

  await connection.end();
}

run().catch(console.error);