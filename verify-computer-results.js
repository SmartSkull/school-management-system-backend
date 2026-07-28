const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

const students = [
  'greatkings/2022/f058','greatkings/2022/4727','greatkings/2022/ccd7',
  'greatkings/2022/be4a','greatkings/2022/06cc','greatkings/2022/2caa',
  'greatkings/2022/4d97','greatkings/2022/dfe8','greatkings/2022/4478',
  'greatkings/2022/9781','greatkings/2022/4c52','greatkings/2022/0afb',
  'greatkings/2022/f726','greatkings/2023/1037','greatkings/2023/3e7c',
  'greatkings/2024/e854','greatkings/2025/a339','greatkings/2025/1c37',
];

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // session 11 = 2025/2026, term 33 = THIRD
  let allGood = true;
  for (const uid of students) {
    const [[row]] = await conn.execute(`
      SELECT r.testScore, r.examScore, r.totalScore, r.grade
      FROM Result r
      JOIN Subject sub ON sub.id = r.subjectId
      JOIN Student st ON st.id = r.studentId
      JOIN User u ON u.id = st.userId
      WHERE u.uniqueId = ? AND sub.name = 'Computer' AND r.sessionId = 11 AND r.termId = 33
    `, [uid]);

    if (row) {
      console.log(`✅ ${uid} — Computer: test=${row.testScore} exam=${row.examScore} total=${row.totalScore} grade=${row.grade}`);
    } else {
      console.log(`❌ ${uid} — NO Computer result found!`);
      allGood = false;
    }
  }

  console.log(allGood ? '\n✅ All students have Computer results intact.' : '\n❌ Some students are missing Computer results!');
  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
