const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net',
    port: 29012,
    user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren',
  });

  const [tables] = await conn.query('SHOW TABLES');
  for (const row of tables) {
    const tableName = Object.values(row)[0];
    const [count] = await conn.query(`SELECT COUNT(*) as c FROM \`${tableName}\``);
    console.log(`${tableName}: ${count[0].c} rows`);
  }

  await conn.end();
}

main().catch(console.error);
