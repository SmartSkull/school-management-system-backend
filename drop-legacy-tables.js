const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net',
    port: 29012,
    user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren',
  });

  await conn.query('SET FOREIGN_KEY_CHECKS = 0');

  const tables = [
    'academicsession', 'academicterm', 'assignment', 'attendance',
    'cbtanswer', 'cbtquestion', 'cbtresult', 'cbttest', 'classroom',
    'classtimetable', 'comment', 'examtimetable', 'libraryresource',
    'like', 'message', 'notification', 'post', 'result', 'school',
    'schooldays', 'schoolfeeconfig', 'schoolfeepayment', 'scratchcard',
    'staff', 'student', 'subject', 'user',
  ];

  for (const table of tables) {
    try {
      await conn.query(`DROP TABLE IF EXISTS \`${table}\``);
      console.log(`✅ Dropped: ${table}`);
    } catch (e) {
      console.error(`❌ ${table}: ${e.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('Done!');
  await conn.end();
}

main().catch(console.error);
