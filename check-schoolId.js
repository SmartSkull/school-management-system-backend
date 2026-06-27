const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const [r] = await conn.execute("SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = 'florieren' AND COLUMN_NAME = 'schoolId' ORDER BY TABLE_NAME");
  console.log(r.map(x => x.TABLE_NAME).join(', '));
  await conn.end();
}
main().catch(e => console.error(e));
