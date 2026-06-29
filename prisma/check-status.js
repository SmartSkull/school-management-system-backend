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
  
  console.log(`Users: ${u[0].c}`);
  console.log(`Students: ${s[0].c}`);
  console.log(`Attendance: ${a[0].c}`);

  const [classStats] = await conn.execute('SELECT classRoomId, COUNT(*) as cnt FROM Student GROUP BY classRoomId');
  console.log('\nClassRoomId distribution:');
  classStats.forEach(c => console.log(`  ${c.classRoomId || 'NULL'}: ${c.cnt}`));

  await conn.end();
})();