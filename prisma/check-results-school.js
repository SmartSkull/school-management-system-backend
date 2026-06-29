const mysql = require('mysql2/promise');
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

  // Check results for 2025/2026 with more details
  const [results] = await conn.execute(`
    SELECT 
      s.name as sessionName,
      t.name as termName,
      COUNT(r.id) as resultCount,
      COUNT(DISTINCT r.studentId) as studentCount
    FROM Result r
    JOIN AcademicSession s ON r.sessionId = s.id
    JOIN AcademicTerm t ON r.termId = t.id
    WHERE s.name = '2025/2026'
    GROUP BY r.sessionId, r.termId
  `);

  console.log('2025/2026 results breakdown:');
  results.forEach(r => {
    console.log(`  ${r.sessionName} ${r.termName}: ${r.resultCount} results, ${r.studentCount} students`);
  });

  // Check if there's a schoolId issue
  const [schoolCheck] = await conn.execute(`
    SELECT s.schoolId, COUNT(r.id) as cnt 
    FROM Result r
    JOIN AcademicSession s ON r.sessionId = s.id
    WHERE s.name = '2025/2026'
    GROUP BY s.schoolId
  `);
  console.log('\nBy school:');
  schoolCheck.forEach(r => console.log(`  School ${r.schoolId}: ${r.cnt} results`));

  await conn.end();
})();