const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  
  console.log('Updating User.schoolId where NULL...');
  const [res] = await conn.execute('UPDATE User SET schoolId = 9 WHERE schoolId IS NULL');
  console.log('Updated', res.affectedRows, 'user records');
  
  console.log('Updating ClassRoom.schoolId where NULL...');
  const [res2] = await conn.execute('UPDATE ClassRoom SET schoolId = 9 WHERE schoolId IS NULL');
  console.log('Updated', res2.affectedRows, 'classroom records');
  
  console.log('Updating AcademicSession.schoolId where NULL...');
  const [res3] = await conn.execute('UPDATE AcademicSession SET schoolId = 9 WHERE schoolId IS NULL');
  console.log('Updated', res3.affectedRows, 'session records');
  
  console.log('Updating AttendanceLocation.schoolId where NULL...');
  const [res4] = await conn.execute('UPDATE AttendanceLocation SET schoolId = 9 WHERE schoolId IS NULL');
  console.log('Updated', res4.affectedRows, 'attendance location records');
  
  await conn.end();
}
main().catch(e => console.error(e));
