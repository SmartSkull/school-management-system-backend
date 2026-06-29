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
    // Also map variations
    subjectMap.set(s.name, s.id);
  });

  // Get GKA students
  const [students] = await conn.execute('SELECT id, studentNo FROM Student WHERE studentNo LIKE "greatkings%"');
  const studentMap = new Map(students.map(s => [s.studentNo, s.id]));

  // Find GKA 2025/2026 SECOND term results
  let gkaSql = '';
  try {
    gkaSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  } catch (e) {
    console.log('GKA SQL not found');
    await conn.end();
    return;
  }

  // Find lines with 2025/2026 session and second term
  const gkaLines = gkaSql.split('\n').filter(l => 
    l.includes("'2025/2026'") && l.includes("'second'") && l.includes("'greatkings/")
  );

  console.log(`Found ${gkaLines.length} GKA 2025/2026 SECOND term lines`);

  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const values = [];
  let matched = 0;
  let skipped = 0;

  for (const line of gkaLines) {
    const parts = line.split(',');
    // Format: (id, teacher, student_id, class, course, session, term, first_term, second_term, test, exam, ...)
    const studentId = parts[2]?.replace(/'/g, '').trim();
    const course = parts[4]?.replace(/'/g, '').trim();
    const testScore = parseFloat(parts[9]?.replace(/[^0-9.-]/g, '')) || 0;
    const examScore = parseFloat(parts[10]?.replace(/[^0-9.-]/g, '')) || 0;

    const student = studentMap.get(studentId);
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (student && subjectId) {
      matched++;
      const totalScore = testScore + examScore;
      values.push(`(${student.id}, ${subjectId}, 11, 32, ${testScore}, ${examScore}, ${totalScore}, '${now}', '${now}')`);
    } else {
      if (!student) console.log(`No student for ${studentId}`);
      if (!subjectId) console.log(`No subject for ${course}`);
      skipped++;
    }
  }

  console.log(`Matched: ${matched}, Skipped: ${skipped}`);

  // Write GKA SQL
  fs.writeFileSync('gka-results-second-term.sql',
    `INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore, createdAt, updatedAt) VALUES\n${values.join(',\n')};\n`
  );
  console.log('Wrote gka-results-second-term.sql');

  await conn.end();
})();