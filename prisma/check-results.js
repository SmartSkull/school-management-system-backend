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
    database: process.env.DB_NAME
  });

  const [resultCount] = await conn.execute('SELECT COUNT(*) as c FROM Result');
  console.log(`Result records in DB: ${resultCount[0].c}`);

  // Get unique student IDs in results
  const [uniqueStudents] = await conn.execute('SELECT COUNT(DISTINCT studentId) as c FROM Result');
  console.log(`Unique students with results: ${uniqueStudents[0].c}`);

  // Check for missing results (students in DB but no results)
  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const studentIds = students.map(s => s.id);

  const placeholders = studentIds.map(() => '?').join(',');
  const [withResults] = await conn.execute(
    `SELECT COUNT(*) as c FROM Result WHERE studentId IN (${placeholders.slice(0, 100)})`, // Limit query
    studentIds.slice(0, 100)
  );
  console.log(`First 100 students checked`);

  // Sample check
  const [sample] = await conn.execute('SELECT s.studentNo, COUNT(r.id) as rc FROM Student s LEFT JOIN Result r ON s.id = r.studentId GROUP BY s.studentNo LIMIT 10');
  console.log('\nSample student results:');
  sample.forEach(s => console.log(`${s.studentNo}: ${s.rc} results`));

  await conn.end();
})();