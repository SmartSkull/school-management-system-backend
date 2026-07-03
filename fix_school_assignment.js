require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const url = process.env.DATABASE_URL;
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  const [, user, password, host, port, database] = m;
  const conn = await mysql.createConnection({ host, port: parseInt(port), user, password, database, ssl: { rejectUnauthorized: false } });

  // Confirm what we're about to fix
  const [[room]] = await conn.query('SELECT id, schoolId, name FROM ClassRoom WHERE id = 103');
  console.log('ClassRoom to fix:', room);

  const [students] = await conn.query(`
    SELECT u.uniqueId, u.firstName, u.lastName, u.schoolId as userSchoolId
    FROM Student st
    JOIN User u ON u.id = st.userId
    WHERE st.classRoomId = 103
  `);
  console.log(`${students.length} students in this class`);

  // Fix 1: Move ClassRoom 103 from schoolId=8 (Florieren) to schoolId=9 (GreatKings)
  const [r1] = await conn.execute('UPDATE ClassRoom SET schoolId = 9 WHERE id = 103');
  console.log(`\n✓ Updated ClassRoom 103 schoolId to 9 (affected ${r1.affectedRows} row)`);

  // Verify no more mismatches
  const [[{ total }]] = await conn.query(`
    SELECT COUNT(*) as total
    FROM User u
    JOIN Student st ON st.userId = u.id
    LEFT JOIN ClassRoom c ON c.id = st.classRoomId
    WHERE u.schoolId != c.schoolId
      AND c.schoolId IS NOT NULL
      AND u.schoolId IS NOT NULL
  `);
  console.log(`\nRemaining mismatched students: ${total}`);

  if (total == 0) {
    console.log('✅ All students are now correctly assigned to their school.');
  }

  await conn.end();
}
main().catch(e => console.error('Error:', e.message));
