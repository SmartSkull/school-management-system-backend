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
    subjectMap.set(s.name.toLowerCase(), s.id);
    subjectMap.set(s.name, s.id);
  });

  // Get students
  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const studentMap = new Map(students.map(s => [s.studentNo, s.id]));

  // Read SQL and find Florieren 2025/2026 SECOND term results
  const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');
  const flLines = flSql.split('\n').filter(l => 
    l.includes("'fpis/") && l.includes("'2025/2026'") && l.includes("'second'")
  );

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const values = [];
  let matched = 0;
  let skipped = 0;

  for (const line of flLines) {
    const parts = line.split(',');
    // Format: (id, staffId, studentNo, subject, session, term, ..., testScore, examScore, totalScore, ...)
    const studentNo = parts[2]?.replace(/'/g, '').trim();
    const course = parts[3]?.replace(/'/g, '').trim();
    const testScore = parseFloat(parts[8]?.replace(/[^0-9.-]/g, '')) || 0;
    const examScore = parseFloat(parts[9]?.replace(/[^0-9.-]/g, '')) || 0;

    const studentId = studentMap.get(studentNo);
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (studentId && subjectId) {
      matched++;
      const totalScore = testScore + examScore;
      values.push(`(${studentId}, ${subjectId}, 30, 45, ${testScore}, ${examScore}, ${totalScore}, '${now}', '${now}')`);
    } else {
      if (!studentId) console.log(`No student for ${studentNo}`);
      if (!subjectId) console.log(`No subject for ${course}`);
      skipped++;
    }
  }

  console.log(`Matched: ${matched}, Skipped: ${skipped}`);

  // Write proper SQL
  fs.writeFileSync('florieren-results-second-term.sql',
    `INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore, createdAt, updatedAt) VALUES\n${values.join(',\n')};\n`
  );
  console.log('Wrote florieren-results-second-term.sql');

  await conn.end();
})();