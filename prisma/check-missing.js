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

  // Get subjects
  const [subjects] = await conn.execute('SELECT id, name FROM Subject');
  const subjectMap = new Map();
  subjects.forEach(s => {
    const name = s.name.toLowerCase();
    subjectMap.set(name, s.id);
    subjectMap.set(s.name, s.id);
  });

  // Get GKA students
  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const studentMap = new Map(students.map(s => [s.studentNo, s.id]));

  // Check GKA SQL 2025/2026 SECOND lines
  const gkaSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  const gkaSecondLines = gkaSql.split('\n').filter(l => 
    l.includes("'greatkings/") && l.includes("'2025/2026'") && l.includes("'second'")
  );

  const missingSubjects = new Set();
  const missingStudents = new Set();

  for (const line of gkaSecondLines) {
    const parts = line.split(',');
    const studentNo = parts[2]?.replace(/'/g, '').trim();
    const course = parts[4]?.replace(/'/g, '').trim();

    const studentId = studentMap.get(studentNo);
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (!studentId) missingStudents.add(studentNo);
    if (!subjectId) missingSubjects.add(course);
  }

  console.log('Missing students:', [...missingStudents].slice(0, 10));
  console.log('Missing subjects:', [...missingSubjects].slice(0, 20));

  await conn.end();
})();