const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000,
  });

  const [before] = await connection.execute('SELECT COUNT(*) as c FROM Attendance');
  console.log(`Before: ${before[0].c} records`);

  // Run one chunk at a time
  for (let i = 0; i < 14; i++) {
    const sql = fs.readFileSync(`attendance-chunk-${i}.sql`, 'utf8');
    const [result] = await connection.query(sql);
    console.log(`Chunk ${i}: executed`);
  }

  const [after] = await connection.execute('SELECT COUNT(*) as c FROM Attendance');
  console.log(`\nAfter: ${after[0].c} records`);
  
  await connection.end();
}

run().catch(console.error);