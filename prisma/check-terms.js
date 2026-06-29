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

  // Check terms for Florieren (schoolId=8)
  const [terms] = await conn.execute('SELECT id, name, sessionId, schoolId FROM AcademicTerm WHERE schoolId = 8');
  console.log('Florieren terms (schoolId=8):');
  terms.forEach(t => console.log(`  Term ${t.id}: ${t.name} (sessionId=${t.sessionId}, schoolId=${t.schoolId})`));

  // Check if terms exist without schoolId filter
  const [allTerms] = await conn.execute(`
    SELECT t.id, t.name, t.sessionId, s.name as sessionName, t.schoolId 
    FROM AcademicTerm t 
    JOIN AcademicSession s ON t.sessionId = s.id
    WHERE s.schoolId = 8
  `);
  console.log('\nTerms via session schoolId filter:');
  allTerms.forEach(t => console.log(`  Term ${t.id}: ${t.name} - ${t.sessionName} (schoolId=${t.schoolId})`));

  await conn.end();
})();