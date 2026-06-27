const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const values = [[11, 'test2', '2026-01-01 00:00:00', '2026-01-01 00:00:00']];
  const res = await conn.query('INSERT IGNORE INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES ?', [values]);
  console.log('res[0]:', JSON.stringify(res[0], null, 2));
  console.log('res[1]:', JSON.stringify(res[1], null, 2));
  await conn.execute('DELETE FROM ClassRoom WHERE schoolId = 11');
  await conn.end();
}
main().catch(e => console.error(e));
