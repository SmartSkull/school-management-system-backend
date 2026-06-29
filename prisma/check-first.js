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

  // Check Florieren 2025/2026 FIRST term - why is it 0?
  const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');
  const flFirstLines = flSql.split('\n').filter(l => 
    l.includes("'fpis/") && l.includes("'2025/2026'") && l.includes("'first'")
  );
  console.log(`Florieren 2025/2026 FIRST term SQL lines: ${flFirstLines.length}`);

  const flSecondLines = flSql.split('\n').filter(l => 
    l.includes("'fpis/") && l.includes("'2025/2026'") && l.includes("'second'")
  );
  console.log(`Florieren 2025/2026 SECOND term SQL lines: ${flSecondLines.length}`);

  // Check database for Florieren 2025/2026 FIRST
  const [checkFirst] = await conn.execute('SELECT COUNT(*) as c FROM Result WHERE sessionId = 30 AND termId = 44');
  console.log(`Florieren 2025/2026 FIRST (session=30, term=44) in DB: ${checkFirst[0].c}`);

  // Check existing 2025/2026 results
  const [all2025] = await conn.execute(`
    SELECT t.name, COUNT(r.id) as cnt 
    FROM Result r 
    JOIN AcademicSession s ON r.sessionId = s.id 
    JOIN AcademicTerm t ON r.termId = t.id 
    WHERE s.id = 30 
    GROUP BY t.name
  `);
  console.log('\nFlorieren 2025/2026 all terms:', all2025);

  await conn.end();
})();