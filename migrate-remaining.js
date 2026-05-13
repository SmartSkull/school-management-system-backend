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
    ['`Like`', '`like`'],
    ['Message', 'message'],
    ['Notification', 'notification'],
    ['Assignment', 'assignment'],
    ['LibraryResource', 'libraryresource'],
  ];

  for (const [target, source] of tables) {
    try {
      const [res] = await conn.query(`INSERT IGNORE INTO ${target} SELECT * FROM ${source}`);
      console.log(`✅ ${target}: ${res.affectedRows} rows inserted`);
    } catch (e) {
      console.error(`❌ ${target}: ${e.message}`);
    }
  }

  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
  console.log('Done!');
  await conn.end();
}

main().catch(console.error);
