const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net',
    port: 29012,
    user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren',
    multipleStatements: true,
  });

  const sql = fs.readFileSync('C:\\Users\\01aba\\Downloads\\florieren_v2.sql', 'utf8');
  console.log('Importing...');
  await conn.query(sql);
  console.log('Done!');
  await conn.end();
}

main().catch(console.error);
