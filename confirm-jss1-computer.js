const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Get all current JSS1A students at greatkings
  const [students] = await conn.execute(`
    SELECT u.uniqueId, u.firstName, u.lastName, st.id as studentId, cr.name as class
    FROM User u
    JOIN Student st ON st.userId = u.id
    JOIN ClassRoom cr ON cr.id = st.classRoomId
    WHERE cr.name LIKE '%JSS1%' AND u.schoolId = 9
    ORDER BY u.firstName
  `);

  console.log(`Current JSS1A students: ${students.length}`);

  let hasComputer = 0, missingComputer = 0;
  for (const s of students) {
    const [[comp]] = await conn.execute(
      "SELECT r.id, r.testScore, r.examScore, r.totalScore FROM Result r JOIN Subject sub ON sub.id = r.subjectId WHERE r.studentId = ? AND sub.name = 'Computer' AND r.sessionId = 11 AND r.termId = 31 LIMIT 1",
      [s.studentId]
    );
    if (comp) {
      hasComputer++;
      console.log(`  ✅ ${s.firstName} ${s.lastName} (${s.uniqueId}) test=${comp.testScore} exam=${comp.examScore} total=${comp.totalScore}`);
    } else {
      missingComputer++;
      console.log(`  ❌ ${s.firstName} ${s.lastName} (${s.uniqueId}) — NO Computer result`);
    }
  }

  console.log(`\nHas Computer: ${hasComputer}, Missing: ${missingComputer}`);
  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
