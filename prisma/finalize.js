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

  // These 7 users don't have user records in SQL - just set them to "Student"
  const [unknown] = await conn.execute(
    "SELECT uniqueId, firstName, lastName FROM User WHERE firstName = 'Unknown'"
  );

  for (const u of unknown) {
    await conn.execute(
      'UPDATE User SET firstName = ? WHERE uniqueId = ?',
      ['Student', u.uniqueId]
    );
    console.log(`Set ${u.uniqueId} firstName to "Student"`);
  }

  // Final report
  const [att] = await conn.execute('SELECT COUNT(*) as c FROM Attendance');
  const [users] = await conn.execute('SELECT COUNT(*) as c FROM User');
  const [students] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  const [nullClass] = await conn.execute('SELECT COUNT(*) as c FROM Student WHERE classRoomId IS NULL');

  console.log('\n=== FINAL MIGRATION COMPLETION ===');
  console.log(`Attendance: ${att[0].c}`);
  console.log(`Users: ${users[0].c}`);
  console.log(`Students: ${students[0].c}`);
  console.log(`Students with NULL class: ${nullClass[0].c}`);

  await conn.end();
})();