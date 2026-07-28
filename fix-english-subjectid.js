const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

const SESSION_ID  = 11; // 2025/2026
const TO_SUBJECT  = 47; // correct English-Language (classRoomId=null)

async function fixTerm(conn, termId, termName, fromSubjectId) {
  const [results] = await conn.execute(`
    SELECT r.id, r.studentId, r.testScore, r.examScore, r.totalScore, u.uniqueId
    FROM Result r
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    WHERE r.subjectId = ? AND r.sessionId = ? AND r.termId = ? AND u.schoolId = 9
  `, [fromSubjectId, SESSION_ID, termId]);

  console.log(`\n${termName} (termId=${termId}): ${results.length} results with subjectId=${fromSubjectId} to remap → ${TO_SUBJECT}`);

  let updated = 0, skipped = 0;
  for (const r of results) {
    const [[existing]] = await conn.execute(
      'SELECT id FROM Result WHERE studentId = ? AND subjectId = ? AND sessionId = ? AND termId = ? LIMIT 1',
      [r.studentId, TO_SUBJECT, SESSION_ID, termId]
    );
    if (existing) {
      console.log(`  SKIP ${r.uniqueId}: already has subjectId=${TO_SUBJECT}`);
      skipped++;
    } else {
      await conn.execute('UPDATE Result SET subjectId = ? WHERE id = ?', [TO_SUBJECT, r.id]);
      updated++;
    }
  }
  console.log(`  Done: ${updated} updated, ${skipped} skipped`);
}

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Fix SECOND term (termId=32): subjectId=138 → 47, subjectId=1 → 47
  await fixTerm(conn, 32, 'SECOND', 138);
  await fixTerm(conn, 32, 'SECOND', 1);

  // Final verification
  const [check] = await conn.execute(`
    SELECT r.termId, t.name as term, r.subjectId, COUNT(*) as cnt
    FROM Result r
    JOIN AcademicTerm t ON t.id = r.termId
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    WHERE sub.name = 'English-Language' AND r.sessionId = ? AND u.schoolId = 9
    GROUP BY r.termId, r.subjectId ORDER BY r.termId
  `, [SESSION_ID]);

  console.log('\n✅ English-Language after full fix:');
  check.forEach(r => console.log(`  termId=${r.termId} term=${r.term} subjectId=${r.subjectId} cnt=${r.cnt}`));

  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
