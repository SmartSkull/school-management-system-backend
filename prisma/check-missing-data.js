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

  // Check a sample user
  const [samples] = await conn.execute(
    "SELECT u.uniqueId, u.firstName, u.lastName, u.email, u.telephone, s.studentNo, s.classRoomId FROM User u JOIN Student s ON u.id = s.userId WHERE u.uniqueId LIKE 'greatkings/%' LIMIT 10"
  );

  console.log('Sample GKA users:');
  samples.forEach(s => {
    console.log(`${s.uniqueId}: "${s.firstName}" "${s.lastName}", email=${s.email || '(none)'}, phone=${s.telephone || '(none)'}, classId=${s.classRoomId || '(none)'}`);
  });

  // Check counts
  const [counts] = await Promise.all([
    conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "greatkings/%"'),
    conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "fpis/%"'),
    conn.execute('SELECT COUNT(*) as c FROM User WHERE email = "" OR email IS NULL'),
    conn.execute('SELECT COUNT(*) as c FROM User WHERE telephone = "" OR telephone IS NULL')
  ]);

  console.log('\nCounts:');
  console.log(' GKA users:', counts[0][0].c);
  console.log(' Florieren users:', counts[1][0].c);
  console.log(' Users with empty email:', counts[2][0].c);
  console.log(' Users with empty telephone:', counts[3][0].c);

  await conn.end();
})();