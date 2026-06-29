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

  // Fix: Set each term to correct schoolId based on session's schoolId
  // First, set GKA terms (sessionId=11) to schoolId=9
  const gkaResult = await conn.execute(
    'UPDATE AcademicTerm t JOIN AcademicSession s ON t.sessionId = s.id SET t.schoolId = 9 WHERE s.schoolId = 9'
  );
  console.log(`Updated ${gkaResult[0].affectedRows} GKA terms to have schoolId=9`);

  // Verify
  const [check] = await conn.execute(`
    SELECT t.name, s.schoolId, t.schoolId as termSchoolId
    FROM AcademicTerm t
    JOIN AcademicSession s ON t.sessionId = s.id
    WHERE s.name = '2025/2026'
  `);
  console.log('\nAll 2025/2026 terms with correct schoolId:');
  check.forEach(t => console.log(`  ${t.name}: sessionSchoolId=${t.schoolId}, termSchoolId=${t.termSchoolId}`));

  await conn.end();
})();