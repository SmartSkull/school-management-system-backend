const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');

  // These 4 have results but class was never recorded in the SQL at all.
  // d2f4/9005/011f are from 2021/2022 — old graduated students → COMPLETED
  // student/2024/34d4 has a non-greatkings ID format — likely a test account → COMPLETED
  const toFix = [
    { uniqueId: 'greatkings/2022/d2f4', targetClass: 'COMPLETED' },
    { uniqueId: 'greatkings/2022/9005', targetClass: 'COMPLETED' },
    { uniqueId: 'greatkings/2022/011f', targetClass: 'COMPLETED' },
    { uniqueId: 'student/2024/34d4',    targetClass: 'COMPLETED' },
  ];

  const [[classRow]] = await conn.execute(
    "SELECT id FROM ClassRoom WHERE schoolId = 9 AND name = 'COMPLETED'"
  );
  const completedId = classRow.id;
  console.log(`COMPLETED classRoomId = ${completedId}`);

  for (const s of toFix) {
    const [users] = await conn.execute(
      'SELECT u.id, u.firstName, u.lastName, st.id AS studentId FROM User u JOIN Student st ON st.userId = u.id WHERE u.uniqueId = ?',
      [s.uniqueId]
    );
    if (!users.length) { console.log(`  [NOT FOUND] ${s.uniqueId}`); continue; }
    const { studentId, firstName, lastName } = users[0];
    await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [completedId, studentId]);
    console.log(`  ✓ ${s.uniqueId} "${firstName} ${lastName}" → ${s.targetClass}`);
  }

  // Final count
  const [[{ cnt }]] = await conn.execute(`
    SELECT COUNT(*) cnt FROM User u JOIN Student s ON s.userId = u.id
    WHERE u.schoolId = 9 AND u.role = 'STUDENT' AND s.classRoomId IS NULL
  `);
  const [[{ total }]] = await conn.execute(
    "SELECT COUNT(*) total FROM User WHERE schoolId = 9 AND role = 'STUDENT'"
  );
  console.log(`\nGKA students without class : ${cnt}`);
  console.log(`Total GKA students         : ${total}`);
  await conn.end();
  console.log('Done ✓');
}
main().catch(console.error);
