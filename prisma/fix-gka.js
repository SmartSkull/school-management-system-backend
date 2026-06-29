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

  // Move GKA 2025/2026 SECOND results from wrong termId=42 to correct termId=32
  // First verify these are GKA students
  const [verify] = await conn.execute(`
    SELECT COUNT(*) as c FROM Result r
    JOIN Student st ON r.studentId = st.id
    JOIN User u ON st.userId = u.id
    WHERE r.sessionId = 11 AND r.termId = 42 AND u.schoolId = 9
  `);
  console.log(`GKA students under wrong term (session=11, term=42): ${verify[0].c}`);

  if (verify[0].c > 0) {
    // Update the termId
    const result = await conn.execute(
      'UPDATE Result SET termId = 32 WHERE sessionId = 11 AND termId = 42'
    );
    console.log(`Moved ${result[0].affectedRows} results to correct termId=32`);
  }

  // Verify
  const [check] = await conn.execute('SELECT COUNT(*) as c FROM Result WHERE sessionId = 11 AND termId = 32');
  console.log(`GKA 2025/2026 SECOND now has ${check[0].c} results`);

  const [checkWrong] = await conn.execute('SELECT COUNT(*) as c FROM Result WHERE sessionId = 11 AND termId = 42');
  console.log(`GKA 2025/2026 SECOND under wrong term now has ${checkWrong[0].c} results`);

  await conn.end();
})();