const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  const [sess] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession WHERE schoolId = 8');
  console.log('Florieren (school 8) sessions:', sess.length);
  sess.forEach(s => console.log(' ', s.name));

  const [gkSess] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession WHERE schoolId = 9');
  console.log('\nGreatkings (school 9) sessions:', gkSess.length);
  gkSess.forEach(s => console.log(' ', s.name));

  await conn.end();
})();