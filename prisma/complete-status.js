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

  const [u] = await conn.execute('SELECT COUNT(*) as c FROM User');
  const [s] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  const [a] = await conn.execute('SELECT COUNT(*) as c FROM Attendance');
  const [r] = await conn.execute('SELECT COUNT(*) as c FROM Result');
  const [sess] = await conn.execute('SELECT COUNT(*) as c FROM AcademicSession');
  const [term] = await conn.execute('SELECT COUNT(*) as c FROM AcademicTerm');
  const [nullClass] = await conn.execute('SELECT COUNT(*) as c FROM Student WHERE classRoomId IS NULL');

  console.log('=== COMPLETE DATABASE STATUS ===\n');
  console.log(`Users: ${u[0].c}`);
  console.log(`Students: ${s[0].c}`);
  console.log(`Attendance: ${a[0].c}`);
  console.log(`Results: ${r[0].c}`);
  console.log(`Sessions: ${sess[0].c}`);
  console.log(`Terms: ${term[0].c}`);
  console.log(`Students with NULL classRoomId: ${nullClass[0].c}`);

  await conn.end();
})();