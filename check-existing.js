const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net',
    port: 29012,
    user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
    database: 'florieren'
  });

  const [u1] = await conn.execute('SELECT * FROM User WHERE uniqueId = "admin/2022/3a18"');
  console.log('admin/2022/3a18:', u1.length ? 'EXISTS' : 'NOT FOUND');

  const [u2] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "staff/2022/%"');
  console.log('staff/2022 count:', u2[0].c);

  const [u3] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE uniqueId LIKE "greatkings/%"');
  console.log('greatkings count:', u3[0].c);

  const [s1] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  console.log('total students:', s1[0].c);

  const [s2] = await conn.execute('SELECT COUNT(*) as c FROM Staff');
  console.log('total staff:', s2[0].c);

  const [c1] = await conn.execute('SELECT COUNT(*) as c FROM ClassRoom');
  console.log('total classrooms:', c1[0].c);

  const [c2] = await conn.execute('SELECT * FROM ClassRoom LIMIT 10');
  console.log('classrooms sample:', c2);

  const [a1] = await conn.execute('SELECT COUNT(*) as c FROM Assignment');
  console.log('total assignments:', a1[0].c);

  const [r1] = await conn.execute('SELECT COUNT(*) as c FROM Result');
  console.log('total results:', r1[0].c);

  const [att1] = await conn.execute('SELECT COUNT(*) as c FROM Attendance');
  console.log('total attendance:', att1[0].c);

  await conn.end();
}
main().catch(e => console.error(e));
