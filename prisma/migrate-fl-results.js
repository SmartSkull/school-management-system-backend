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

  // Get students and subjects
  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const [subjects] = await conn.execute('SELECT id, name FROM Subject');
  
  const studentMap = new Map(students.map(s => [s.studentNo, s.id]));
  const subjectMap = new Map();
  subjects.forEach(s => {
    subjectMap.set(s.name.toLowerCase(), s.id);
    subjectMap.set(s.name, s.id);
  });

  // Florieren: INSERT INTO result (result_id, teacher_id, student_id, course, session, term, first_term_score, second_term_score, test_score, exam_score, ...)
  // Columns: result_id(0), teacher_id(1), student_id(2), course(3), session(4), term(5), first_term_score(6), second_term_score(7), test_score(8), exam_score(9), ...
  
  const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');
  const flLines = flSql.split('\n').filter(l => 
    l.trim().startsWith('(') && l.includes("'fpis/") && 
    l.includes("'2025/2026'") && l.includes("'second'")
  );

  console.log(`Florieren 2025/2026 second term result lines: ${flLines.length}`);

  // Florieren 2025/2026 second term IDs
  const flSessId = 30;  // session id
  const flTermId = 45;   // term id

  let migrated = 0;
  let skipped = 0;

  for (const line of flLines) {
    // Better parsing
    const parts = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "'") inQuote = !inQuote;
      else if (char === ',' && !inQuote) {
        parts.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current.trim());

    const studentNo = parts[2]?.replace(/^'|'$/g, '');
    const course = parts[3]?.replace(/^'|'$/g, '');
    const testScore = parseFloat(parts[8]) || 0;
    const examScore = parseFloat(parts[9]) || 0;
    const totalScore = parseFloat(parts[10]) || (testScore + examScore);

    const studentId = studentMap.get(studentNo);
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (studentId && subjectId) {
      try {
        await conn.execute(
          'INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [studentId, subjectId, flSessId, flTermId, testScore, examScore, totalScore]
        );
        migrated++;
      } catch (e) { skipped++; }
    } else {
      if (!studentId) skipped++;
    }
  }

  console.log(`Migrated ${migrated} Florieren SECOND term results`);
  console.log(`Skipped ${skipped} records (missing student or subject)`);

  // Final check
  const [final] = await conn.execute(`
    SELECT COUNT(*) as c FROM Result 
    WHERE sessionId = ? AND termId = ?
  `, [flSessId, flTermId]);
  console.log(`\nFlorieren 2025/2026 SECOND term now has ${final[0].c} results`);

  await conn.end();
})();