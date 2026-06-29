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

  // Check all sessions named 2025/2026
  const [sessions] = await conn.execute(
    'SELECT id, name, schoolId FROM AcademicSession'
  );
  
  const sess2025 = sessions.filter(s => s.name === '2025/2026');
  console.log('Sessions named 2025/2026:');
  sess2025.forEach(s => console.log(`  id=${s.id}, schoolId=${s.schoolId}`));

  // Check all terms for these sessions
  const sessIds = sess2025.map(s => s.id);
  for (const sid of sessIds) {
    const [terms] = await conn.execute(
      'SELECT id, name, sessionId FROM AcademicTerm WHERE sessionId = ?', [sid]
    );
    console.log(`\nTerms for session ${sid}:`);
    terms.forEach(t => console.log(`  id=${t.id}, name=${t.name}`));
    
    // Count results
    const [cnt] = await conn.execute(
      'SELECT COUNT(*) as c FROM Result WHERE sessionId = ? AND termId = ?', 
      [sid, terms[0]?.id]
    );
    console.log(`  Results: ${cnt[0].c}`);
  }

  // Check what the UI might be querying
  const [gkaSess] = await conn.execute(
    'SELECT s.id FROM AcademicSession s WHERE s.name = "2025/2026" AND s.schoolId = 9'
  );
  if (gkaSess.length > 0) {
    const [gkaTerms] = await conn.execute(
      'SELECT t.id, t.name FROM AcademicTerm t WHERE t.sessionId = ?', [gkaSess[0].id]
    );
    console.log('\nGKA 2025/2026 terms:');
    gkaTerms.forEach(t => {
      console.log(`  ${t.name}(id=${t.id})`);
    });
  }

  await conn.end();
})();