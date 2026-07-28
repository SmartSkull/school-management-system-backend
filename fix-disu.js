const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');
  await conn.execute(
    "UPDATE User SET firstName = ?, lastName = ?, email = ?, telephone = ? WHERE uniqueId = ?",
    ['DISU', "AL'AMEEN", 'auspom4real@gmail.com', '08062093770', 'greatkings/2025/cbdb']
  );
  const [r] = await conn.execute(
    "SELECT id, uniqueId, firstName, lastName, schoolId FROM User WHERE uniqueId = ?",
    ['greatkings/2025/cbdb']
  );
  console.log('Fixed record:', JSON.stringify(r[0]));
  await conn.end();
}
main().catch(console.error);
