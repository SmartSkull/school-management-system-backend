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

  // These users were manually created - give them proper names based on attendance comments
  // greatkings/2022/d2f4: "This boy is a very good student" - male
  // greatkings/2022/9005: "This is the principal comment" - no gender hint
  // greatkings/2022/011f: "This is the principal comment" - no gender hint
  
  const updates = [
    { id: 'greatkings/2022/d2f4', first: 'Unknown', last: 'Boy', email: '', phone: '' },
    { id: 'greatkings/2022/9005', first: 'Unknown', last: 'Student', email: '', phone: '' },
    { id: 'greatkings/2022/011f', first: 'Unknown', last: 'Student', email: '', phone: '' },
    { id: 'student/2024/34d4', first: 'Melissa', last: 'Unknown', email: '', phone: '' }
  ];

  for (const u of updates) {
    await conn.execute(
      'UPDATE User SET firstName = ?, lastName = ?, email = ?, telephone = ? WHERE uniqueId = ?',
      [u.first, u.last, u.email, u.phone, u.id]
    );
    console.log(`Updated ${u.id}`);
  }

  // Check remaining unknown
  const [remaining] = await conn.execute(
    "SELECT uniqueId, firstName, lastName FROM User WHERE firstName = 'Unknown' OR lastName = 'Unknown'"
  );
  console.log(`\nRemaining Unknown users: ${remaining.length}`);

  await conn.end();
})();