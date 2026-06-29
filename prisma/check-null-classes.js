const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  // Check which students still have NULL classRoomId
  const [nullStudents] = await conn.execute(
    'SELECT s.studentNo, s.userId FROM Student s WHERE s.classRoomId IS NULL LIMIT 20'
  );

  console.log('Students with NULL classRoomId (sample):');
  nullStudents.forEach(s => console.log(`  ${s.studentNo}`));

  // Check what class fields were in SQL for these
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  
  for (const s of nullStudents) {
    // Find this student in SQL
    const match = gkSql.match(new RegExp(`\\(${s.userId}, '${s.studentNo.replace('/', '\\/')}'[^)]*\\)`));
    if (match) {
      const line = match[0];
      const parts = line.split(',');
      console.log(`  ${s.studentNo}: class field = "${parts[10]?.replace(/'/g, '')}"`);
    }
  }

  // Create missing classes for GKA
  const missingClasses = ['completed', 'left']; // These are status, not classes
  console.log('\nMissing class values to check:', missingClasses);

  await conn.end();
})();