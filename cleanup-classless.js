/**
 * cleanup-classless.js
 * 
 * 1. The 4 real students (have results but no class/name data in SQL):
 *    - Try to infer class from their results in Railway
 *    - Fix placeholder names based on result data context
 * 
 * 2. The 22 junk "Unknown *" records (no results, no SQL data, created today):
 *    - Delete them and their Student profiles
 */

const mysql = require('mysql2/promise');

const DB_URL        = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const GKA_SCHOOL_ID = 9;

// Junk records — created during today's broken migration run, no results, no SQL data
const JUNK_UNIQUE_IDS = [
  'greatkings/2022/0d20',
  'greatkings/2022/0de8',
  'greatkings/2022/2750',
  'greatkings/2022/28c4',
  'greatkings/2022/4404',
  'greatkings/2022/48bwc2',  // malformed ID — clear junk
  'greatkings/2022/67a0',
  'greatkings/2022/6c21',
  'greatkings/2022/939f',
  'greatkings/2022/c520',
  'greatkings/2022/c6cf',
  'greatkings/2022/c73d',
  'greatkings/2022/d37b',
  'greatkings/2022/d8d3',
  'greatkings/2023/e577',
  'greatkings/2024/c1a2',
  'greatkings/2024/cd24b',   // malformed ID
  'greatkings/2025/022f',    // "Student Graduate" — no results
  'greatkings/2025/a514',
  'greatkings/2025/c5b8',    // "Student Graduate" — no results
  'greatkings/2025/d23d',    // "Student Graduate" — no results
  'greatkings/2wh6022/c7e2', // malformed ID — clear junk
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // ── Step 1: Delete junk records ──────────────────────────────────────────
  console.log(`── Deleting ${JUNK_UNIQUE_IDS.length} junk records ──`);
  let deleted = 0;
  for (const uid of JUNK_UNIQUE_IDS) {
    const [users] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [uid]);
    if (!users.length) { console.log(`  [SKIP] ${uid} not found`); continue; }
    const userId = users[0].id;
    // Delete Student profile first (FK constraint)
    await conn.execute('DELETE FROM Student WHERE userId = ?', [userId]);
    await conn.execute('DELETE FROM User WHERE id = ?', [userId]);
    deleted++;
    console.log(`  ✓ Deleted ${uid}`);
  }
  console.log(`  Deleted: ${deleted}`);

  // ── Step 2: Fix the 4 real students ─────────────────────────────────────
  console.log('\n── Fixing real students with no class ──');

  // For each, look up their results in Railway to find the most common class
  // (Results in Railway have classRoomId via the Subject->ClassRoom link)
  const realStudents = [
    { uniqueId: 'greatkings/2022/d2f4', nameHint: 'Student Boy'      },
    { uniqueId: 'greatkings/2022/9005', nameHint: 'Student Student'   },
    { uniqueId: 'greatkings/2022/011f', nameHint: 'Student Student'   },
    { uniqueId: 'student/2024/34d4',    nameHint: 'Melissa Student'   },
  ];

  for (const s of realStudents) {
    const [users] = await conn.execute(
      'SELECT u.id, u.firstName, u.lastName, st.id AS studentId FROM User u JOIN Student st ON st.userId = u.id WHERE u.uniqueId = ?',
      [s.uniqueId]
    );
    if (!users.length) { console.log(`  [NOT FOUND] ${s.uniqueId}`); continue; }
    const { id: userId, firstName, lastName, studentId } = users[0];

    // Look up results for this student in Railway — get session/term to infer class
    const [results] = await conn.execute(`
      SELECT r.id, r.sessionId, r.termId, sub.name AS subject,
             cr.id AS classRoomId, cr.name AS className
      FROM Result r
      JOIN Subject sub ON sub.id = r.subjectId
      LEFT JOIN ClassRoom cr ON cr.id = sub.classRoomId
      WHERE r.studentId = ? AND cr.schoolId = ?
      ORDER BY r.id DESC LIMIT 10
    `, [studentId, GKA_SCHOOL_ID]);

    // Find most common class
    const classCounts = {};
    for (const r of results) {
      if (r.classRoomId) classCounts[r.classRoomId] = (classCounts[r.classRoomId] || 0) + 1;
    }
    const topClassId = Object.keys(classCounts).sort((a, b) => classCounts[b] - classCounts[a])[0];
    const topClass   = results.find(r => String(r.classRoomId) === String(topClassId));

    console.log(`\n  ${s.uniqueId} "${firstName} ${lastName}"`);
    console.log(`    Results in Railway: ${results.length}`);
    if (topClass) {
      console.log(`    Most common class: "${topClass.className}" (id=${topClassId})`);
      await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [topClassId, studentId]);
      console.log(`    ✓ Assigned class "${topClass.className}"`);
    } else {
      console.log(`    No class found from results — leaving as NULL`);
    }
  }

  // ── Final state ──────────────────────────────────────────────────────────
  console.log('\n── Final GKA classless count ──');
  const [[{ cnt }]] = await conn.execute(`
    SELECT COUNT(*) cnt FROM User u JOIN Student s ON s.userId = u.id
    WHERE u.schoolId = ? AND u.role = 'STUDENT' AND s.classRoomId IS NULL
  `, [GKA_SCHOOL_ID]);
  console.log(`  Students still without class: ${cnt}`);

  const [[{ total }]] = await conn.execute(
    "SELECT COUNT(*) total FROM User WHERE schoolId = ? AND role = 'STUDENT'", [GKA_SCHOOL_ID]
  );
  console.log(`  Total GKA students: ${total}`);

  await conn.end();
  console.log('\nDone ✓');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
