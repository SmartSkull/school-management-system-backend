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

  // Check the term mapping - what session/term do those 233 results actually belong to?
  // The GKA 2025/2026 SECOND results are under sessionId=11, termId=42 (2024/2025 SECOND)
  
  // Let me check where they SHOULD be - sessionId=11, termId=32 (2025/2026 SECOND)
  // First, check if there are any results under actual 2025/2026 SECOND
  const [checkCurrent] = await conn.execute('SELECT COUNT(*) as c FROM Result WHERE sessionId = 11 AND termId = 32');
  console.log(`GKA 2025/2026 SECOND (session=11, term=32) currently has ${checkCurrent[0].c} results`);

  // Check the 233 results under wrong term
  const [checkWrong] = await conn.execute('SELECT COUNT(*) as c FROM Result WHERE sessionId = 11 AND termId = 42');
  console.log(`GKA 2025/2026 SECOND (wrongly under session=11, term=42) has ${checkWrong[0].c} results`);

  // Get term 42 info
  const [term42] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm WHERE id = 42');
  console.log('Term 42:', term42);

  // Get session for term 42
  const [sess42] = await conn.execute('SELECT id, name FROM AcademicSession WHERE id = (SELECT sessionId FROM AcademicTerm WHERE id = 42)');
  console.log('Session for term 42:', sess42);

  await conn.end();
})();