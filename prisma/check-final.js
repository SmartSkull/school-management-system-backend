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

  const [gkUsers] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "greatkings/%"');
  const [flUsers] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "fpis/%"');
  const [nullEmail] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE email = ""');
  const [nullPhone] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE telephone = ""');

  console.log('Database completeness:');
  console.log(' GKA users:', gkUsers[0].c);
  console.log(' Florieren users:', flUsers[0].c);
  console.log(' Users with empty email:', nullEmail[0].c);
  console.log(' Users with empty telephone:', nullPhone[0].c);

  // Check Student records
  const [students] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  console.log(' Student records:', students[0].c);

  // Check which students are missing names/emails
  const [missing] = await conn.execute(
    'SELECT u.uniqueId, u.firstName, u.lastName, u.email FROM User u WHERE u.uniqueId LIKE "greatkings/%" AND (u.firstName = "" OR u.lastName = "" OR u.email = "") LIMIT 5'
  );
  if (missing.length > 0) {
    console.log('\nSample users with missing data:');
    missing.forEach(u => console.log(u.uniqueId, u.firstName, u.lastName, u.email));
  } else {
    console.log('\nAll users have complete first/last name and email');
  }

  await conn.end();
})();