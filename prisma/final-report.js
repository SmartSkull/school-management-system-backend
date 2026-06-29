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

  const [att] = await conn.execute('SELECT COUNT(*) as c FROM Attendance');
  const [users] = await conn.execute('SELECT COUNT(*) as c FROM User');
  const [students] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  const [nullClass] = await conn.execute('SELECT COUNT(*) as c FROM Student WHERE classRoomId IS NULL');
  const [unknown] = await conn.execute("SELECT COUNT(*) as c FROM User WHERE firstName = 'Unknown' OR lastName = 'Unknown'");

  console.log('=== FINAL MIGRATION STATUS ===');
  console.log('Attendance records:', att[0].c);
  console.log('Total Users:', users[0].c);
  console.log('Student records:', students[0].c);
  console.log('Students with NULL classRoomId:', nullClass[0].c);
  console.log('Users with Unknown names:', unknown[0].c);

  await conn.end();
})();