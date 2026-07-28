const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

// 2025/2026 session = 11, THIRD term = 33
// ICT subjectId = 40, Data-Processing subjectId = 43
// Target Computer subjectId = 17
const SESSION_ID = 11;
const TERM_ID = 33;
const SOURCE_SUBJECT_IDS = [40, 43]; // ICT, Data-Processing
const COMPUTER_SUBJECT_ID = 17;

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  for (const srcId of SOURCE_SUBJECT_IDS) {
    const [[sub]] = await conn.execute('SELECT name FROM Subject WHERE id = ?', [srcId]);
    console.log(`\nProcessing: "${sub.name}" (subjectId=${srcId}) → Computer (subjectId=${COMPUTER_SUBJECT_ID})`);

    const [results] = await conn.execute(
      'SELECT id, studentId FROM Result WHERE subjectId = ? AND sessionId = ? AND termId = ?',
      [srcId, SESSION_ID, TERM_ID]
    );
    console.log(`  Found ${results.length} results to migrate`);

    let updated = 0, skipped = 0;
    for (const r of results) {
      // Check if Computer result already exists for this student in this term
      const [[existing]] = await conn.execute(
        'SELECT id FROM Result WHERE studentId = ? AND subjectId = ? AND sessionId = ? AND termId = ? LIMIT 1',
        [r.studentId, COMPUTER_SUBJECT_ID, SESSION_ID, TERM_ID]
      );
      if (existing) {
        console.log(`    Student ${r.studentId}: already has Computer result, skipping`);
        skipped++;
      } else {
        await conn.execute('UPDATE Result SET subjectId = ? WHERE id = ?', [COMPUTER_SUBJECT_ID, r.id]);
        updated++;
      }
    }
    console.log(`  Done: ${updated} updated, ${skipped} skipped`);
  }

  // Verify final count
  const [[count]] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM Result WHERE subjectId = ? AND sessionId = ? AND termId = ?',
    [COMPUTER_SUBJECT_ID, SESSION_ID, TERM_ID]
  );
  console.log(`\n✅ Computer results for 2025/2026 THIRD term: ${count.cnt}`);

  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
