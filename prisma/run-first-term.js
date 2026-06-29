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

  const sql = fs.readFileSync('florieren-results-first-term.sql', 'utf8');
  const result = await conn.query(sql);
  console.log(`Inserted ${result[0].affectedRows} Florieren 2025/2026 FIRST term results`);

  // Verify
  const [check] = await conn.execute('SELECT COUNT(*) as c FROM Result WHERE sessionId = 30 AND termId = 44');
  console.log(`Florieren 2025/2026 FIRST term now has ${check[0].c} results`);

  await conn.end();
})();