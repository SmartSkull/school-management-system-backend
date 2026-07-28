const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

// Legacy data from greatkin_gk.sql — JSS1A Computer, 2025/2026 FIRST term
const legacyResults = [
  { uniqueId: 'greatkings/2024/5ed2', test: 39, exam: 40, total: 79 },
  { uniqueId: 'greatkings/2024/7cc1', test: 40, exam: 54, total: 94 },
  { uniqueId: 'greatkings/2024/850f', test: 20, exam: 21, total: 41 },
  { uniqueId: 'greatkings/2024/912d', test: 30, exam: 19, total: 49 },
  { uniqueId: 'greatkings/2024/e227', test: 40, exam: 40, total: 80 },
  { uniqueId: 'greatkings/2024/e4cc', test: 30, exam: 1,  total: 31 },
  { uniqueId: 'greatkings/2024/0644', test: 25, exam: 31, total: 56 },
  { uniqueId: 'greatkings/2024/16ac', test: 40, exam: 46, total: 86 },
  { uniqueId: 'greatkings/2024/492d', test: 38, exam: 48, total: 86 },
  { uniqueId: 'greatkings/2024/b6a8', test: 20, exam: 41, total: 61 },
  { uniqueId: 'greatkings/2024/f99c', test: 20, exam: 10, total: 30 },
  { uniqueId: 'greatkings/2024/0e74', test: 40, exam: 33, total: 73 },
  { uniqueId: 'greatkings/2024/2a63', test: 35, exam: 35, total: 70 },
  { uniqueId: 'greatkings/2024/f6e4', test: 40, exam: 36, total: 76 },
  { uniqueId: 'greatkings/2024/16fd', test: 40, exam: 31, total: 71 },
  { uniqueId: 'greatkings/2024/9cc5', test: 40, exam: 40, total: 80 },
  { uniqueId: 'greatkings/2024/6c9b', test: 40, exam: 51, total: 91 },
  { uniqueId: 'greatkings/2024/cf4a', test: 40, exam: 20, total: 60 },
  { uniqueId: 'greatkings/2024/2b9a', test: 30, exam: 42, total: 72 },
  { uniqueId: 'greatkings/2024/a285', test: 35, exam: 40, total: 75 },
  { uniqueId: 'greatkings/2024/6889', test: 35, exam: 29, total: 64 },
  { uniqueId: 'greatkings/2023/52a1', test: 32, exam: 18, total: 50 },
  { uniqueId: 'greatkings/2024/721d', test: 20, exam: 32, total: 52 },
];

function gradeFromTotal(total) {
  if (total >= 70) return 'A';
  if (total >= 60) return 'B';
  if (total >= 50) return 'C';
  if (total >= 45) return 'D';
  if (total >= 40) return 'E';
  return 'F';
}

function remarkFromGrade(grade) {
  const map = { A: 'Excellent', B: 'Very Good', C: 'Good', D: 'Pass', E: 'Poor', F: 'Fail' };
  return map[grade] || 'Fail';
}

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Constants: school=9, session=11 (2025/2026), term=31 (FIRST), Computer subjectId=17
  const SESSION_ID = 11;
  const TERM_ID = 31;
  const SUBJECT_ID = 17; // Computer (classRoomId=null)

  let inserted = 0, skipped = 0, notFound = 0;

  for (const row of legacyResults) {
    // Find student by uniqueId
    const [[user]] = await conn.execute(
      'SELECT u.id as userId, st.id as studentId FROM User u JOIN Student st ON st.userId = u.id WHERE u.uniqueId = ? AND u.schoolId = 9 LIMIT 1',
      [row.uniqueId]
    );

    if (!user) {
      console.log(`  NOT FOUND: ${row.uniqueId}`);
      notFound++;
      continue;
    }

    // Check if result already exists
    const [[existing]] = await conn.execute(
      'SELECT id FROM Result WHERE studentId = ? AND subjectId = ? AND sessionId = ? AND termId = ? LIMIT 1',
      [user.studentId, SUBJECT_ID, SESSION_ID, TERM_ID]
    );

    if (existing) {
      console.log(`  SKIP (exists): ${row.uniqueId} studentId=${user.studentId}`);
      skipped++;
      continue;
    }

    const grade = gradeFromTotal(row.total);
    const remark = remarkFromGrade(grade);

    await conn.execute(
      'INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore, grade, remark, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
      [user.studentId, SUBJECT_ID, SESSION_ID, TERM_ID, row.test, row.exam, row.total, grade, remark]
    );
    console.log(`  INSERTED: ${row.uniqueId} test=${row.test} exam=${row.exam} total=${row.total} grade=${grade}`);
    inserted++;
  }

  console.log(`\n✅ Done: ${inserted} inserted, ${skipped} skipped (already existed), ${notFound} students not found`);
  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
