/**
 * Efficient attendance migration using MySQL batch insert
 */

import * as mysql from 'mysql2/promise';
import * as fs from 'fs';
import * as dotenv from 'dotenv';

dotenv.config();

function parseNumeric(val: string): number {
  if (!val || val.trim() === '' || val.toLowerCase() === 'nil' || val.toLowerCase() === 'null' || val.trim() === '-') {
    return 0;
  }
  const parsed = parseInt(val.trim(), 10);
  return isNaN(parsed) ? 0 : parsed;
}

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASS || '',
    database: process.env.DB_NAME || 'florieren',
    connectTimeout: 15000,
  });

  console.log('🔧 Starting efficient attendance migration...\n');

  // Get session and term mappings
  const [sessions] = await connection.execute(`SELECT id, name, schoolId FROM AcademicSession`);
  const sessionMap = new Map<string, { id: number, schoolId: number }>();
  for (const s of (sessions as any[])) {
    sessionMap.set(`${s.schoolId}_${s.name}`, s);
  }

  const [terms] = await connection.execute(`SELECT id, sessionId, name FROM AcademicTerm`);
  const termMap = new Map<string, number>();
  for (const t of (terms as any[])) {
    termMap.set(`${t.sessionId}_${t.name}`, t.id);
  }

  // Read all attendance records
  const allRecords = JSON.parse(fs.readFileSync('all-attendance-to-migrate.json', 'utf8'));
  
  // Build student lookup - batch fetch
  const allStudentIds = [...new Set(allRecords.map((r: any) => r.studentId))];
  const placeholders = allStudentIds.map(() => '?').join(',');
  
  const [existingStudents] = await connection.execute(
    `SELECT id, studentNo FROM Student WHERE studentNo IN (${placeholders})`,
    allStudentIds
  );
  
  const studentMap = new Map<string, number>();
  for (const s of (existingStudents as any[])) {
    studentMap.set(s.studentNo, s.id);
  }
  
  console.log(`Found ${studentMap.size} students in DB out of ${allStudentIds.length} needed`);

  // Check existing attendance to skip duplicates
  const [existingAtt] = await connection.execute(`SELECT studentId, sessionId, termId FROM Attendance`);
  const attKey = new Set<string>();
  for (const a of (existingAtt as any[])) {
    attKey.add(`${a.studentId}_${a.sessionId}_${a.termId}`);
  }
  console.log(`Found ${attKey.size} existing attendance records to skip\n`);

  // Prepare inserts
  let toInsert: any[] = [];
  let skippedStudent = 0;
  let skippedSession = 0;
  
  for (const record of allRecords) {
    const { studentId, present, absent, comment, principal, term, session } = record;
    
    const studentDbId = studentMap.get(studentId);
    if (!studentDbId) {
      skippedStudent++;
      continue;
    }

    const schoolId = studentId.startsWith('greatkings') ? 9 : 8;
    const sessKey = `${schoolId}_${session}`;
    const sess = sessionMap.get(sessKey);
    if (!sess) {
      skippedSession++;
      continue;
    }

    const termKey = `${sess.id}_${term.toUpperCase()}`;
    const termId = termMap.get(termKey);
    if (!termId) {
      skippedSession++;
      continue;
    }

    const key = `${studentDbId}_${sess.id}_${termId}`;
    if (attKey.has(key)) continue;

    toInsert.push([
      studentDbId, sess.id, termId,
      parseNumeric(present),
      parseNumeric(absent),
      comment || '',
      principal || '',
      new Date(),
      new Date()
    ]);
  }

  console.log(`To insert: ${toInsert.length} records`);
  console.log(`Skipped (no student): ${skippedStudent}`);
  console.log(`Skipped (no session/term): ${skippedSession}`);

  // Batch insert
  if (toInsert.length > 0) {
    const sql = `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES ?`;
    const [result] = await connection.query(sql, toInsert);
    console.log(`\n✅ Inserted ${toInsert.length} records`);
  }

  // Final count
  const [finalCount] = await connection.execute('SELECT COUNT(*) as c FROM Attendance');
  console.log(`\n=== FINAL ATTENDANCE COUNT: ${(finalCount as any[])[0].c} ===`);

  await connection.end();
}

run().catch(console.error);