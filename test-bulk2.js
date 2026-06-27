const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const values = [[10, 'test1', '2026-01-01 00:00:00', '2026-01-01 00:00:00']];
  const res = await conn.query('INSERT IGNORE INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES ?', [values]);
  console.log('Res type:', typeof res);
  console.log('Res keys:', Object.keys(res));
  console.log('Has insertId:', 'insertId' in res);
  console.log('insertId:', res.insertId);
  await conn.execute('DELETE FROM ClassRoom WHERE schoolId = 10');
  await conn.end();
}
main().catch(e => console.error(e));
