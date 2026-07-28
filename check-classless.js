const mysql = require('mysql2/promise');
async function main() {
  const conn = await mysql.createConnection('mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren');

  // Get the 26 still classless
  const [rows] = await conn.execute(`
    SELECT u.id, u.uniqueId, u.firstName, u.lastName, u.createdAt,
           (SELECT COUNT(*) FROM Student st2
            JOIN Result r ON r.studentId = st2.id
            WHERE st2.userId = u.id) AS resultCount
    FROM User u
    JOIN Student s ON s.userId = u.id
    WHERE u.schoolId = 9 AND u.role = 'STUDENT' AND s.classRoomId IS NULL
    ORDER BY u.uniqueId
  `);

  console.log(`Remaining classless GKA students: ${rows.length}\n`);
  rows.forEach(r => {
    console.log(`  ${r.uniqueId} | "${r.firstName} ${r.lastName}" | results: ${r.resultCount} | created: ${r.createdAt}`);
  });

  // Separate: those with results (real students) vs those without (likely junk)
  const withResults    = rows.filter(r => r.resultCount > 0);
  const withoutResults = rows.filter(r => r.resultCount === 0);
  console.log(`\nWith results (real students): ${withResults.length}`);
  console.log(`Without results (likely test/junk): ${withoutResults.length}`);

  await conn.end();
}
main().catch(console.error);
