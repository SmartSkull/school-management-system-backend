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

  // Get Florieren students
  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const studentMap = new Map(students.map(s => [s.studentNo, s.id]));

  // Read SQL
  const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');
  const flLines = flSql.split('\n').filter(l => 
    l.includes("'fpis/") && l.includes("'2025/2026'") && l.includes("'first'")
  );

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const values = [];
  let matched = 0;
  let skipped = 0;

  for (const line of flLines) {
    const parts = line.split(',');
    const studentNo = parts[2]?.replace(/'/g, '').trim();
    const course = parts[3]?.replace(/'/g, '').trim();
    const testScore = parseFloat(parts[8]?.replace(/[^0-9.-]/g, '')) || 0;
    const examScore = parseFloat(parts[9]?.replace(/[^0-9.-]/g, '')) || 0;

    const studentId = studentMap.get(studentNo);
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (studentId && subjectId) {
      matched++;
      const totalScore = testScore + examScore;
      values.push(`(${studentId}, ${subjectId}, 30, 44, ${testScore}, ${examScore}, ${totalScore}, '${now}', '${now}')`);
    } else {
      skipped++;
    }
  }

  console.log(`Matched: ${matched}, Skipped: ${skipped}`);

  // Write SQL
  fs.writeFileSync('florieren-results-first-term.sql',
    `INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore, createdAt, updatedAt) VALUES\n${values.join(',\n')};\n`
  );
  console.log('Wrote florieren-results-first-term.sql');

  await conn.end();
})();