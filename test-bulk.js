const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const values = [[1, 'a', now()], [2, 'b', now()]];
  const res = await conn.query('INSERT INTO _test (id, name, created) VALUES ?', [values]);
  console.log('Result type:', typeof res);
  console.log('Result:', JSON.stringify(res, null, 2));
  await conn.execute('DROP TABLE IF EXISTS _test');
  await conn.end();
}
main().catch(e => console.error(e));
function now() {
  return new Date().toISOString().slice(0,19).replace('T',' ');
}
