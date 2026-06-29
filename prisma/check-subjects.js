const mysql = require('mysql2/promise');
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

  // Check subjects
  const [subjects] = await conn.execute('SELECT id, name FROM Subject');
  console.log('Subjects in DB:', subjects.length);
  subjects.slice(0, 20).forEach(s => console.log(`  ${s.name} (id=${s.id})`));

  // Check results for a sample student
  const [sample] = await conn.execute('SELECT * FROM Result LIMIT 5');
  console.log('\nSample results:');
  sample.forEach(r => console.log(`  studentId=${r.studentId}, subjectId=${r.subjectId}, test=${r.testScore}, exam=${r.examScore}`));

  await conn.end();
})();