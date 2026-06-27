const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  const [s] = await conn.execute('SELECT COUNT(*) as c FROM User');
  console.log('Users:', s[0].c);
  const [s2] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  console.log('Students:', s2[0].c);
  const [s3] = await conn.execute('SELECT COUNT(*) as c FROM Staff');
  console.log('Staff:', s3[0].c);
  await conn.end();
}
main();
