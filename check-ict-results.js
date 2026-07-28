const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  const [rows] = await conn.execute(`
    SELECT r.sessionId, r.termId, s2.name as session, t.name as term, sub.name as subject, COUNT(*) as cnt
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN AcademicSession s2 ON s2.id = r.sessionId
    JOIN AcademicTerm t ON t.id = r.termId
    WHERE sub.name IN ('ICT', 'Data-Processing', 'Computer')
    AND sub.classRoomId IN (SELECT id FROM ClassRoom WHERE schoolId = 9)
    GROUP BY r.sessionId, r.termId, sub.name
    ORDER BY r.sessionId, r.termId
  `);

  console.log('Results by session/term for ICT, Data-Processing, Computer (school=greatkings):');
  console.log(JSON.stringify(rows, null, 2));

  // Also check with null classRoomId subjects
  const [rows2] = await conn.execute(`
    SELECT r.sessionId, r.termId, s2.name as session, t.name as term, sub.name as subject, sub.id as subjectId, sub.classRoomId, COUNT(*) as cnt
    FROM Result r
    JOIN Subject sub ON sub.id = r.subjectId
    JOIN AcademicSession s2 ON s2.id = r.sessionId
    JOIN AcademicTerm t ON t.id = r.termId
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    WHERE sub.name IN ('ICT', 'Data-Processing', 'Computer')
    AND u.schoolId = 9
    GROUP BY r.sessionId, r.termId, sub.name, sub.id
    ORDER BY r.sessionId, r.termId
  `);

  console.log('\nResults via student schoolId (includes null-classRoom subjects):');
  console.log(JSON.stringify(rows2, null, 2));

  await conn.end();
}

main().catch(e => { console.error(e.message); process.exit(1); });
