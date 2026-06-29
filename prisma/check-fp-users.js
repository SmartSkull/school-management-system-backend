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

  const [users] = await conn.execute('SELECT uniqueId, role, schoolId FROM User WHERE uniqueId LIKE "fpis/%"');
  console.log('Florieren users found:', users.length);
  users.forEach(u => console.log(u.uniqueId, 'role:', u.role, 'school:', u.schoolId));

  await conn.end();
})();