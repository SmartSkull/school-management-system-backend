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

  // Update 2025/2026 terms to have schoolId=8
  const result = await conn.execute(
    'UPDATE AcademicTerm t JOIN AcademicSession s ON t.sessionId = s.id SET t.schoolId = 8 WHERE s.name = "2025/2026" AND s.schoolId = 8'
  );
  console.log(`Updated ${result[0].affectedRows} terms to have schoolId=8`);

  // Verify
  const [check] = await conn.execute('SELECT id, name, sessionId, schoolId FROM AcademicTerm WHERE id IN (44, 45, 46)');
  console.log('Updated terms:', check);

  await conn.end();
})();