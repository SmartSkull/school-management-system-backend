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

  // Check if these users exist in the SQL at all
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  
  const checkIds = ['greatkings/2022/d2f4', 'greatkings/2022/9005', 'greatkings/2022/011f'];
  
  for (const id of checkIds) {
    // Count occurrences
    const matches = (gkSql.match(new RegExp(id, 'g')) || []).length;
    console.log(`${id}: found ${matches} times in SQL`);
    
    // Find context
    const idx = gkSql.indexOf(`'${id}'`);
    if (idx > 0) {
      const context = gkSql.substring(Math.max(0, idx - 200), idx + 200);
      console.log(`  Context: ${context.replace(/\n/g, ' ').substring(0, 300)}`);
      console.log();
    }
  }

  await conn.end();
})();