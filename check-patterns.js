const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const patterns = ['student/2022/%', 'staff/2022/%', 'greatkings/%', 'admin2', 'admin', 'admin1'];
  for (const p of patterns) {
    const [r] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE ?', [p]);
    console.log(p + ':', r[0].c);
  }
  await conn.end();
}
main();
