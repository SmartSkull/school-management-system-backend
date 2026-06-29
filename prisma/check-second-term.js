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

  // Check for duplicate term IDs with SECOND
  const [terms] = await conn.execute(
    'SELECT id, name, sessionId FROM AcademicTerm WHERE name = "SECOND"'
  );
  console.log('All SECOND terms:');
  terms.forEach(t => console.log(`  id=${t.id}, sessionId=${t.sessionId}`));

  // Check results for each
  for (const t of terms) {
    const [cnt] = await conn.execute(
      'SELECT COUNT(*) as c FROM Result WHERE sessionId = (SELECT id FROM AcademicSession WHERE schoolId = 9 AND name = "2025/2026") AND termId = ?',
      [t.id]
    );
    console.log(`  Term ${t.id}: ${cnt[0].c} results for GKA 2025/2026`);
  }

  // Check what session has 233 second term results
  const [s] = await conn.execute(
    'SELECT sessionId FROM Result r JOIN AcademicTerm t ON r.termId = t.id WHERE t.name = "SECOND" LIMIT 1'
  );
  const [sessName] = await conn.execute(
    'SELECT s.name, s.schoolId FROM AcademicSession s WHERE s.id = ?', [s[0]?.sessionId]
  );
  console.log('\nSession for second term:', sessName[0]);

  await conn.end();
})();