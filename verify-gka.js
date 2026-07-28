const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');
  
  // Students with no Student profile
  const [orphans] = await conn.execute(
    "SELECT u.uniqueId, u.firstName, u.lastName FROM User u LEFT JOIN Student s ON s.userId = u.id WHERE u.schoolId = 9 AND u.role = 'STUDENT' AND s.id IS NULL LIMIT 20"
  );
  console.log('Students missing Student profile:', orphans.length);
  if (orphans.length) orphans.forEach(r => console.log(' -', r.uniqueId, r.firstName, r.lastName));
  
  // Fix any that are missing a Student row
  if (orphans.length > 0) {
    console.log('Fixing orphaned users...');
    for (const u of orphans) {
      const [userRow] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [u.uniqueId]);
      if (!userRow.length) continue;
      await conn.execute(
        'INSERT IGNORE INTO Student (userId, studentNo, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())',
        [userRow[0].id, u.uniqueId]
      );
      console.log('  Fixed:', u.uniqueId);
    }
  }
  
  // Final counts
  const [[{cnt: students}]] = await conn.execute("SELECT COUNT(*) cnt FROM User WHERE schoolId=9 AND role='STUDENT'");
  const [[{cnt: staff}]] = await conn.execute("SELECT COUNT(*) cnt FROM User WHERE schoolId=9 AND role='STAFF'");
  const [[{cnt: admin}]] = await conn.execute("SELECT COUNT(*) cnt FROM User WHERE schoolId=9 AND role='ADMIN'");
  const [[{cnt: results}]] = await conn.execute(
    "SELECT COUNT(*) cnt FROM Result r JOIN Student st ON st.id=r.studentId JOIN User u ON u.id=st.userId WHERE u.schoolId=9"
  );
  console.log('\n── GKA Railway Final State ──');
  console.log('Students:', students);
  console.log('Staff   :', staff);
  console.log('Admin   :', admin);
  console.log('Results :', results);
  
  // Class distribution
  const [classes] = await conn.execute(
    "SELECT cr.name, COUNT(*) cnt FROM User u JOIN Student s ON s.userId=u.id LEFT JOIN ClassRoom cr ON cr.id=s.classRoomId WHERE u.schoolId=9 AND u.role='STUDENT' GROUP BY cr.name ORDER BY cnt DESC"
  );
  console.log('\nStudents by class:');
  classes.forEach(r => console.log(' ', (r.name || '(no class)') + ':', r.cnt));
  
  await conn.end();
}
main().catch(err => { console.error(err); process.exit(1); });
