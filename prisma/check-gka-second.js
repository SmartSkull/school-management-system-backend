const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  // Check GKA SQL 2025/2026 SECOND lines
  const gkaSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  const gkaSecondLines = gkaSql.split('\n').filter(l => 
    l.includes("'greatkings/") && l.includes("'2025/2026'") && l.includes("'second'")
  );
  console.log(`GKA 2025/2026 SECOND SQL lines: ${gkaSecondLines.length}`);

  // Check GKA students
  const [gkaStudents] = await conn.execute('SELECT COUNT(*) as c FROM Student st JOIN User u ON st.userId = u.id WHERE u.schoolId = 9');
  console.log(`GKA students in DB: ${gkaStudents[0].c}`);

  // Check GKA subjects
  const [gkaSubjects] = await conn.execute('SELECT COUNT(*) as c FROM Subject');
  console.log(`Subjects in DB: ${gkaSubjects[0].c}`);

  // Check expected vs actual
  const [expected] = await conn.execute(`
    SELECT s.subject, COUNT(DISTINCT s.studentId) as studentCount
    FROM Result r
    JOIN Subject s ON r.subjectId = s.id
    WHERE r.sessionId = 11 AND r.termId = 32
    GROUP BY r.subjectId
    ORDER BY studentCount DESC
  `);
  console.log('\nGKA 2025/2026 SECOND by subject:');
  expected.forEach(r => console.log(`  ${r.subject}: ${r.studentCount} students`));

  await conn.end();
})();