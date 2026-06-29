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

  // Check 2025/2026 session for both schools
  const [sessions] = await conn.execute(
    'SELECT id, name, schoolId FROM AcademicSession WHERE name = ?',
    ['2025/2026']
  );

  console.log('2025/2026 sessions found:');
  sessions.forEach(s => console.log(`  id=${s.id}, schoolId=${s.schoolId}`));

  for (const sess of sessions) {
    const [terms] = await conn.execute(
      'SELECT id, name FROM AcademicTerm WHERE sessionId = ?',
      [sess.id]
    );
    
    console.log(`\nTerms for session ${sess.id} (school ${sess.schoolId}):`);
    for (const t of terms) {
      const [results] = await conn.execute(
        'SELECT COUNT(*) as c FROM Result WHERE sessionId = ? AND termId = ?',
        [sess.id, t.id]
      );
      console.log(`  ${t.name}: ${results[0].c} results`);
    }
  }

  await conn.end();
})();