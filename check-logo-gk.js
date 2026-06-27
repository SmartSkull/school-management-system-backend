const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const [r] = await conn.execute("SELECT id, name, logo FROM School WHERE id = 9");
  console.log(JSON.stringify(r[0], null, 2));
  await conn.end();
}
main();
