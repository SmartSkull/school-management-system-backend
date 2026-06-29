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

  const [unknown] = await conn.execute(
    "SELECT uniqueId, firstName, lastName FROM User WHERE firstName = 'Unknown' OR lastName = 'Unknown'"
  );

  console.log('Unknown users:', unknown.length);
  unknown.forEach(u => console.log(`${u.uniqueId}: "${u.firstName} ${u.lastName}"`));

  await conn.end();
})();