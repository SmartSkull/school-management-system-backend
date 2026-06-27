const mysql = require('mysql2/promise');
const fs = require('fs');

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net',
    port: 29012,
    user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren'
  });

  console.log('=== School ===');
  const [sch] = await conn.execute('SELECT * FROM School LIMIT 5');
  console.log(sch);

  console.log('\n=== Users sample ===');
  const [usr] = await conn.execute('SELECT id, uniqueId, role, firstName, lastName FROM User LIMIT 10');
  console.log(usr);

  console.log('\n=== Users with greatkings pattern ===');
  const [gk] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "greatkings/%"');
  console.log(gk[0]);

  console.log('\n=== Users with staff pattern ===');
  const [st] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "staff/%"');
  console.log(st[0]);

  console.log('\n=== Users with admin pattern ===');
  const [ad] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "admin/%"');
  console.log(ad[0]);

  await conn.end();
}
main().catch(e => console.error(e));
