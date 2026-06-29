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

  // Check GKA 2025/2026 terms
  const [gkaTerms] = await conn.execute('SELECT id, name, sessionId, schoolId FROM AcademicTerm WHERE id IN (31, 32, 33)');
  console.log('GKA 2025/2026 terms:', gkaTerms);

  // Update GKA 2025/2026 terms to have schoolId=9
  const result = await conn.execute(
    'UPDATE AcademicTerm t JOIN AcademicSession s ON t.sessionId = s.id SET t.schoolId = 9 WHERE s.name = "2025/2026" AND s.schoolId = 9 AND t.schoolId IS NULL'
  );
  console.log(`Updated ${result[0].affectedRows} GKA terms to have schoolId=9`);

  // Verify all 2025/2026 terms
  const [all2025] = await conn.execute(`
    SELECT t.id, t.name, s.name as session, t.schoolId 
    FROM AcademicTerm t 
    JOIN AcademicSession s ON t.sessionId = s.id
    WHERE s.name = '2025/2026'
  `);
  console.log('\nAll 2025/2026 terms:');
  all2025.forEach(t => console.log(`  ${t.session} ${t.name}: schoolId=${t.schoolId}`));

  await conn.end();
})();