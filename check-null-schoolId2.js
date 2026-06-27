const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  
  const tables = ['AcademicSession', 'AttendanceLocation', 'Book', 'ClassRoom', 'Expense', 'Hostel', 'Income', 'LeaveEntitlement', 'OnlineClass', 'PayrollDeduction', 'TransportBus', 'TransportDriver', 'TransportRoute', 'User'];
  
  for (const t of tables) {
    try {
      const [r] = await conn.execute('SELECT COUNT(*) as c FROM `' + t + '` WHERE schoolId IS NULL OR schoolId = 0');
      if (r[0].c > 0) {
        console.log(t + ': ' + r[0].c + ' rows with NULL/0 schoolId');
      }
    } catch (e) {
      console.log(t + ': error - ' + e.message);
    }
  }
  await conn.end();
}
main().catch(e => console.error(e));
