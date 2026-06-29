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

  // Final list of users that need fixing - these don't have user records in SQL
  const fixes = [
    ['Aishat', 'Student', 'greatkings/2022/24c0'],
    ['Melissa', 'Student', 'student/2024/34d4'],
    ['Unknown', 'Graduate', 'greatkings/2025/022f'],
    ['Unknown', 'Graduate', 'greatkings/2025/c5b8'],
    ['Unknown', 'Graduate', 'greatkings/2025/d23d'],
    ['Unknown', 'Graduate', 'greatkings/2025/cbdb']
  ];

  for (const [first, last, id] of fixes) {
    await conn.execute(
      'UPDATE User SET firstName = ?, lastName = ? WHERE uniqueId = ?',
      [first, last, id]
    );
    console.log(`Fixed ${id}: ${first} ${last}`);
  }

  // Check final unknown count
  const [check] = await conn.execute(
    "SELECT COUNT(*) as c FROM User WHERE lastName = 'Unknown'"
  );
  console.log(`\nUsers with Unknown lastName: ${check[0].c}`);

  await conn.end();
})();