const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // Computer results by class - 2025/2026 (session=11) FIRST term (term=31), school=9
  const [rows] = await conn.execute(`
    SELECT cr.name AS class, sub.id AS subjectId, COUNT(*) AS cnt
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    LEFT JOIN ClassRoom cr ON cr.id = st.classRoomId
    WHERE sub.name = 'Computer'
      AND r.sessionId = 11
      AND r.termId = 31
      AND u.schoolId = 9
    GROUP BY cr.name, sub.id
    ORDER BY cr.name
  `);

  console.log('Computer results per class (2025/2026 FIRST term):');
  console.log(JSON.stringify(rows, null, 2));

  // Now check what JSS1 students have in that term
  const [jss1] = await conn.execute(`
    SELECT sub.name AS subject, COUNT(*) AS cnt
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN Student st ON st.id = r.studentId
    JOIN ClassRoom cr ON cr.id = st.classRoomId
    JOIN User u ON u.id = st.userId
    WHERE cr.name LIKE '%JSS1%'
      AND r.sessionId = 11
      AND r.termId = 31
      AND u.schoolId = 9
    GROUP BY sub.name
    ORDER BY sub.name
  `);

  console.log('\nAll subjects with results for JSS1 students (2025/2026 FIRST term):');
  console.log(JSON.stringify(jss1, null, 2));

  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
