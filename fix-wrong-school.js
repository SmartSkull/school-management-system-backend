const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');

  const GKA_SCHOOL_ID      = 9;
  const FLORIEREN_SCHOOL_ID = 8;
  const wrongStudentIds = [843, 844]; // User.id values

  for (const userId of wrongStudentIds) {
    // Get current state
    const [[user]] = await conn.execute(
      'SELECT id, uniqueId, firstName, lastName, schoolId FROM User WHERE id = ?', [userId]
    );
    console.log(`\nProcessing: ${user.firstName} ${user.lastName} (${user.uniqueId})`);
    console.log(`  Currently schoolId=${user.schoolId}`);

    // Check Student profile
    const [studentRows] = await conn.execute(
      'SELECT s.id, s.classRoomId, cr.name AS className, cr.schoolId AS classSchoolId FROM Student s LEFT JOIN ClassRoom cr ON cr.id = s.classRoomId WHERE s.userId = ?',
      [userId]
    );

    if (studentRows.length === 0) {
      console.log('  No Student profile found — will create one');
    } else {
      const st = studentRows[0];
      console.log(`  Student profile id=${st.id}, classRoom="${st.className}" (schoolId=${st.classSchoolId})`);

      // If classRoom belongs to Florieren, reassign to matching GKA class or null
      if (st.classSchoolId && st.classSchoolId !== GKA_SCHOOL_ID && st.className) {
        const [gkaClass] = await conn.execute(
          'SELECT id FROM ClassRoom WHERE schoolId = ? AND name = ?', [GKA_SCHOOL_ID, st.className]
        );
        const newClassId = gkaClass.length ? gkaClass[0].id : null;
        await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [newClassId, st.id]);
        console.log(`  Updated Student.classRoomId to ${newClassId || 'NULL'} (GKA equivalent of "${st.className}")`);
      }
    }

    // Fix the schoolId on the User record
    await conn.execute('UPDATE User SET schoolId = ? WHERE id = ?', [GKA_SCHOOL_ID, userId]);
    console.log(`  ✓ User.schoolId updated to ${GKA_SCHOOL_ID} (GKA)`);

    // Create Student profile if missing
    if (studentRows.length === 0) {
      await conn.execute(
        'INSERT INTO Student (userId, studentNo, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())',
        [userId, user.uniqueId]
      );
      console.log(`  ✓ Student profile created`);
    }
  }

  // Final verification
  console.log('\n── Verification ──');
  const [check] = await conn.execute(
    "SELECT u.id, u.uniqueId, u.firstName, u.lastName, u.schoolId, cr.name AS class FROM User u LEFT JOIN Student s ON s.userId = u.id LEFT JOIN ClassRoom cr ON cr.id = s.classRoomId WHERE u.uniqueId IN ('greatkings/2026/73eb','greatkings/2026/2913')"
  );
  check.forEach(r => console.log(`  ${r.uniqueId} "${r.firstName} ${r.lastName}" schoolId=${r.schoolId} class="${r.class || 'none'}"`));

  // Confirm no more GKA students under wrong school
  const [remaining] = await conn.execute(
    "SELECT COUNT(*) cnt FROM User WHERE uniqueId LIKE 'greatkings/%' AND schoolId != 9"
  );
  console.log(`\nGKA students still under wrong school: ${remaining[0].cnt}`);

  await conn.end();
  console.log('Done ✓');
}
main().catch(console.error);
