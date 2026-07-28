const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');

  // GKA students sitting under wrong school (schoolId != 9)
  const [wrong] = await conn.execute(
    "SELECT id, uniqueId, firstName, lastName, schoolId FROM User WHERE uniqueId LIKE 'greatkings/%' AND schoolId != 9"
  );
  console.log(`GKA students under wrong schoolId: ${wrong.length}`);
  wrong.forEach(r => console.log(`  id=${r.id} schoolId=${r.schoolId} ${r.uniqueId} "${r.firstName} ${r.lastName}"`));

  // Also check: florieren students (fpis/* or florieren/*) accidentally under GKA
  const [floriUnderGka] = await conn.execute(
    "SELECT id, uniqueId, firstName, lastName, schoolId FROM User WHERE (uniqueId LIKE 'fpis/%' OR uniqueId LIKE 'florieren/%') AND schoolId = 9"
  );
  console.log(`\nFlorieren students under GKA schoolId: ${floriUnderGka.length}`);
  floriUnderGka.forEach(r => console.log(`  id=${r.id} ${r.uniqueId} "${r.firstName} ${r.lastName}"`));

  await conn.end();
}
main().catch(console.error);
