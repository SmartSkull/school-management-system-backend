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

  // Read the generated SQL
  const sql = fs.readFileSync('attendance-insert.sql', 'utf8');
  
  // Split and execute in chunks to avoid timeout
  const statements = sql.split(';').filter(s => s.trim().length > 10);
  console.log(`Found ${statements.length} statement chunks`);

  // Actually just run the full SQL since we generated a single INSERT
  console.log('Executing insert...');
  const result = await connection.query(sql);
  console.log(`Inserted ${result[0].affectedRows || 'unknown'} records`);

  const [count] = await connection.execute('SELECT COUNT(*) as c FROM Attendance');
  console.log(`\n=== FINAL: ${count[0].c} attendance records ===`);

  await connection.end();
}

run().catch(console.error);