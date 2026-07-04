const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren',
    ssl: { rejectUnauthorized: false }
  });

  const [users] = await conn.execute(
    `SELECT id, image FROM User WHERE schoolId = 9 AND image IS NOT NULL AND image != '' AND image NOT LIKE '%cloudinary.com%'`
  );
  console.log('GK users needing migration:', users.length);
  console.log('Samples:', JSON.stringify(users.slice(0, 8), null, 2));

  const [students] = await conn.execute(
    `SELECT s.id, s.parentImage FROM Student s
     JOIN User u ON u.id = s.userId
     WHERE u.schoolId = 9
       AND s.parentImage IS NOT NULL AND s.parentImage != ''
       AND s.parentImage NOT LIKE '%cloudinary.com%'`
  );
  console.log('\nGK students needing migration:', students.length);
  console.log('Samples:', JSON.stringify(students.slice(0, 5), null, 2));

  await conn.end();
})();
