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

  // Check if there are results with wrong sessionId - looking for data that was imported
  // but mapped to wrong session
  const [check] = await conn.execute(`
    SELECT s.name as session, t.name as term, COUNT(r.id) as cnt 
    FROM Result r 
    JOIN AcademicSession s ON r.sessionId = s.id 
    JOIN AcademicTerm t ON r.termId = t.id 
    WHERE s.name LIKE '%2025%' OR s.name LIKE '%2026%'
    GROUP BY r.sessionId, r.termId
  `);

  console.log('Results for 2025/2026 sessions (all):');
  check.forEach(r => console.log(`  ${r.session} ${r.term}: ${r.cnt} results`));

  // Check total for school 9 (GKA) in 2025/2026
  const [gkaTotal] = await conn.execute(`
    SELECT s.schoolId, COUNT(r.id) as cnt
    FROM Result r
    JOIN AcademicSession s ON r.sessionId = s.id
    WHERE s.schoolId = 9
    GROUP BY s.schoolId
  `);
  console.log(`\nGKA total results: ${gkaTotal[0]?.cnt}`);

  await conn.end();
})();