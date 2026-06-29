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

  // Final summary
  const [summary] = await conn.execute(`
    SELECT t.name, COUNT(r.id) as cnt
    FROM AcademicSession s
    JOIN AcademicTerm t ON t.sessionId = s.id
    LEFT JOIN Result r ON r.sessionId = s.id AND r.termId = t.id
    WHERE s.schoolId = 8 AND s.name = '2025/2026'
    GROUP BY t.name
  `);
  console.log('Florieren 2025/2026 results by term:');
  summary.forEach(r => console.log(`  ${r.name}: ${r.cnt}`));

  const [gka] = await conn.execute(`
    SELECT t.name, COUNT(r.id) as cnt
    FROM AcademicSession s
    JOIN AcademicTerm t ON t.sessionId = s.id
    LEFT JOIN Result r ON r.sessionId = s.id AND r.termId = t.id
    WHERE s.schoolId = 9 AND s.name = '2025/2026'
    GROUP BY t.name
  `);
  console.log('\nGKA 2025/2026 results by term:');
  gka.forEach(r => console.log(`  ${r.name}: ${r.cnt}`));

  await conn.end();
})();