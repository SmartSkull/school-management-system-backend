const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');

  // Show all GKA classrooms
  const [classes] = await conn.execute(
    'SELECT id, name FROM ClassRoom WHERE schoolId = 9 ORDER BY name'
  );
  console.log('GKA ClassRooms:');
  classes.forEach(c => console.log(`  id=${c.id} "${c.name}"`));

  // Ss-1 → SS1A, Jss-3 → JSS3A
  const mappings = [
    { uniqueId: 'greatkings/2026/73eb', oldClass: 'Ss-1',  targetClass: 'SS1A'  },
    { uniqueId: 'greatkings/2026/2913', oldClass: 'Jss-3', targetClass: 'JSS3A' },
  ];

  console.log('\nAssigning classes...');
  for (const m of mappings) {
    const match = classes.find(c => c.name.toUpperCase() === m.targetClass.toUpperCase());
    if (!match) {
      console.log(`  No match found for "${m.targetClass}" — skipping ${m.uniqueId}`);
      continue;
    }
    const [[user]] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [m.uniqueId]);
    const [[student]] = await conn.execute('SELECT id FROM Student WHERE userId = ?', [user.id]);
    await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [match.id, student.id]);
    console.log(`  ✓ ${m.uniqueId} → "${match.name}" (id=${match.id})`);
  }

  // Final check
  console.log('\nFinal state:');
  const [check] = await conn.execute(
    "SELECT u.uniqueId, u.firstName, u.lastName, u.schoolId, cr.name AS class FROM User u LEFT JOIN Student s ON s.userId=u.id LEFT JOIN ClassRoom cr ON cr.id=s.classRoomId WHERE u.uniqueId IN ('greatkings/2026/73eb','greatkings/2026/2913')"
  );
  check.forEach(r => console.log(`  ${r.uniqueId} "${r.firstName} ${r.lastName}" schoolId=${r.schoolId} class="${r.class || 'none'}"`));

  await conn.end();
}
main().catch(console.error);
