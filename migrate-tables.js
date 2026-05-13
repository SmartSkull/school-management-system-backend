const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net',
    port: 29012,
    user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren',
    multipleStatements: true,
  });

  console.log('Disabling FK checks...');
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  const queries = [
    // School
    'INSERT IGNORE INTO School SELECT * FROM school',

    // User
    'INSERT IGNORE INTO User SELECT * FROM user',

    // Staff
    'INSERT IGNORE INTO Staff SELECT * FROM staff',

    // Student
    'INSERT IGNORE INTO Student SELECT * FROM student',

    // ClassRoom
    'INSERT IGNORE INTO ClassRoom SELECT * FROM classroom',

    // AcademicSession
    'INSERT IGNORE INTO AcademicSession SELECT * FROM academicsession',

    // AcademicTerm
    'INSERT IGNORE INTO AcademicTerm SELECT * FROM academicterm',

    // Subject
    'INSERT IGNORE INTO Subject SELECT * FROM subject',

    // Result
    'INSERT IGNORE INTO Result SELECT * FROM result',

    // Attendance
    'INSERT IGNORE INTO Attendance SELECT * FROM attendance',

    // CbtTest
    'INSERT IGNORE INTO CbtTest SELECT * FROM cbttest',

    // CbtQuestion
    'INSERT IGNORE INTO CbtQuestion SELECT * FROM cbtquestion',

    // CbtAnswer
    'INSERT IGNORE INTO CbtAnswer SELECT * FROM cbtanswer',

    // CbtResult
    'INSERT IGNORE INTO CbtResult SELECT * FROM cbtresult',

    // SchoolFeeConfig
    'INSERT IGNORE INTO SchoolFeeConfig SELECT * FROM schoolfeeconfig',

    // SchoolFeePayment
    'INSERT IGNORE INTO SchoolFeePayment SELECT * FROM schoolfeepayment',

    // Post
    'INSERT IGNORE INTO Post SELECT * FROM post',

    // Comment
    'INSERT IGNORE INTO Comment SELECT * FROM comment',

    // Like
    'INSERT IGNORE INTO `Like` SELECT * FROM `like`',

    // Message
    'INSERT IGNORE INTO Message SELECT * FROM message',

    // Notification
    'INSERT IGNORE INTO Notification SELECT * FROM notification',

    // Assignment
    'INSERT IGNORE INTO Assignment SELECT * FROM assignment',

    // LibraryResource
    'INSERT IGNORE INTO LibraryResource SELECT * FROM libraryresource',
  ];

  for (const q of queries) {
    const table = q.match(/INTO (\w+)/)[1];
    try {
      const [res] = await conn.query(q);
      console.log(`✅ ${table}: ${res.affectedRows} rows inserted`);
    } catch (e) {
      console.error(`❌ ${table}: ${e.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('\nDone!');
  await conn.end();
}

main().catch(console.error);
