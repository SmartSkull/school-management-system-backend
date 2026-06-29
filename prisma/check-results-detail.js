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

  // Check ALL sessions with first term results
  const [firstTerm] = await conn.execute(`
    SELECT s.id, s.name, s.schoolId, COUNT(r.id) as cnt
    FROM Result r
    JOIN AcademicTerm t ON r.termId = t.id
    JOIN AcademicSession s ON r.sessionId = s.id
    WHERE t.name = 'FIRST'
    GROUP BY r.sessionId
  `);

  console.log('FIRST term results by session:');
  firstTerm.forEach(r => console.log(`  Session ${r.name} (id=${r.id}, school=${r.schoolId}): ${r.cnt} results`));

  // Check for duplicate sessions
  const [dupSessions] = await conn.execute(`
    SELECT name, COUNT(*) as cnt FROM AcademicSession GROUP BY name HAVING cnt > 1
  `);
  console.log('\nDuplicate session names:', dupSessions.length);

  // Check all session names
  const [allSessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession ORDER BY name');
  console.log('\nAll sessions:');
  allSessions.forEach(s => console.log(`  id=${s.id}, name="${s.name}", school=${s.schoolId}`));

  await conn.end();
})();