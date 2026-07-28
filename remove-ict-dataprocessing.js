const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

const COMPUTER_SUBJECT_ID = 17;

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Get all remaining ICT/Data-Processing results for greatkings students
  const [results] = await conn.execute(`
    SELECT r.id, r.studentId, r.subjectId, sub.name as subjectName,
           r.sessionId, r.termId, s.name as session, t.name as term,
           r.testScore, r.examScore, r.totalScore, u.uniqueId
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN AcademicSession s ON s.id = r.sessionId
    JOIN AcademicTerm t ON t.id = r.termId
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    WHERE r.subjectId IN (40, 43) AND u.schoolId = 9
  `);

  console.log(`Remaining ICT/Data-Processing results for greatkings: ${results.length}`);

  let remapped = 0, skipped = 0, deleted = 0;

  for (const r of results) {
    console.log(`  ${r.uniqueId} ${r.subjectName} ${r.session} ${r.term} test=${r.testScore} exam=${r.examScore}`);

    // Check if Computer result already exists for this student+session+term
    const [[existing]] = await conn.execute(
      'SELECT id FROM Result WHERE studentId = ? AND subjectId = ? AND sessionId = ? AND termId = ? LIMIT 1',
      [r.studentId, COMPUTER_SUBJECT_ID, r.sessionId, r.termId]
    );

    if (existing) {
      // Already has Computer result — just delete this ICT/Data-Processing one
      await conn.execute('DELETE FROM Result WHERE id = ?', [r.id]);
      console.log(`    → already has Computer result, deleted this duplicate`);
      deleted++;
    } else {
      // Remap to Computer
      await conn.execute('UPDATE Result SET subjectId = ? WHERE id = ?', [COMPUTER_SUBJECT_ID, r.id]);
      console.log(`    → remapped to Computer (subjectId=${COMPUTER_SUBJECT_ID})`);
      remapped++;
    }
  }

  console.log(`\nRemapped: ${remapped}, Deleted duplicates: ${deleted}, Skipped: ${skipped}`);

  // Now check if subjectIds 40 and 43 still have results for ANY school
  for (const subId of [40, 43]) {
    const [[cnt]] = await conn.execute('SELECT COUNT(*) as cnt FROM Result WHERE subjectId = ?', [subId]);
    console.log(`\nsubjectId=${subId} remaining results (all schools): ${cnt.cnt}`);
  }

  // Delete the now-safe greatkings subject rows (id=40, 43 have null classRoomId - shared)
  // We can only delete them if they have 0 results remaining
  for (const subId of [40, 43]) {
    const [[cnt]] = await conn.execute('SELECT COUNT(*) as cnt FROM Result WHERE subjectId = ?', [subId]);
    if (cnt.cnt === 0) {
      await conn.execute('DELETE FROM Subject WHERE id = ?', [subId]);
      console.log(`✅ Deleted Subject id=${subId}`);
    } else {
      console.log(`⚠️  Subject id=${subId} still has ${cnt.cnt} results from other schools — cannot delete`);
    }
  }

  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
