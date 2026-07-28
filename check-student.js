const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');
  const [rows] = await conn.execute(
    "SELECT id, uniqueId, firstName, lastName, role, schoolId FROM User WHERE uniqueId = ? OR (firstName LIKE ? OR lastName LIKE ? OR firstName LIKE ? OR lastName LIKE ?)",
    ['greatkings/2025/cbdb', '%disu%', '%disu%', '%ameen%', '%ameen%']
  );
  if (rows.length === 0) {
    console.log('NOT FOUND in Railway');
  } else {
    console.log('Found in Railway:');
    rows.forEach(r => console.log(` id=${r.id} uniqueId=${r.uniqueId} name="${r.firstName} ${r.lastName}" role=${r.role} schoolId=${r.schoolId}`));
  }
  await conn.end();
}
main().catch(console.error);
