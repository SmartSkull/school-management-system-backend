const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // session 11 = 2025/2026, term 31=FIRST, 32=SECOND, 33=THIRD
  // Check English-Language subjectIds used per term for greatkings students
  const [rows] = await conn.execute(`
    SELECT r.termId, t.name as term, r.subjectId, sub.name as subject, sub.classRoomId,
           COUNT(*) as cnt
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN AcademicTerm t ON t.id = r.termId
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    WHERE sub.name = 'English-Language'
      AND r.sessionId = 11
      AND u.schoolId = 9
    GROUP BY r.termId, r.subjectId
    ORDER BY r.termId
  `);

  console.log('English-Language subjectIds per term (2025/2026):');
  console.log(JSON.stringify(rows, null, 2));

  // Now check a specific student across all three terms
  const [[student]] = await conn.execute(`
    SELECT u.uniqueId, st.id as studentId, cr.name as class
    FROM User u JOIN Student st ON st.userId = u.id
    LEFT JOIN ClassRoom cr ON cr.id = st.classRoomId
    WHERE u.schoolId = 9 AND u.role = 'STUDENT'
    LIMIT 1
  `);
  console.log(`\nChecking student: ${student.uniqueId} class=${student.class}`);

  const [engResults] = await conn.execute(`
    SELECT r.termId, t.name as term, r.subjectId, sub.name, r.testScore, r.examScore, r.totalScore
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN AcademicTerm t ON t.id = r.termId
    WHERE r.studentId = ? AND sub.name = 'English-Language' AND r.sessionId = 11
    ORDER BY r.termId
  `, [student.studentId]);
  console.log('English-Language results:', JSON.stringify(engResults, null, 2));

  // Check all English-Language subjects in DB
  const [allEng] = await conn.execute(
    "SELECT id, name, classRoomId FROM Subject WHERE name = 'English-Language'"
  );
  console.log('\nAll English-Language subjects:', JSON.stringify(allEng, null, 2));

  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
