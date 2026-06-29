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

  console.log('Migrating missing 2025/2026 SECOND term results...\n');

  // Get sessions/terms
  const [sessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession');
  const [terms] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm');
  
  const gkaSessId = 11; // GKA 2025/2026
  const flSessId = 30;  // Florieren 2025/2026
  
  const termMap = new Map();
  terms.forEach(t => termMap.set(`${t.sessionId}_${t.name}`, t.id));

  const gkaTermId = termMap.get(`${gkaSessId}_SECOND`);
  const flTermId = termMap.get(`${flSessId}_SECOND`);

  console.log(`GKA SECOND term id: ${gkaTermId}`);
  console.log(`Florieren SECOND term id: ${flTermId}`);

  // Get students
  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const studentMap = new Map();
  students.forEach(s => studentMap.set(s.studentNo, s.id));

  // Get subjects
  const [subjects] = await conn.execute('SELECT id, name FROM Subject');
  const subjectMap = new Map();
  subjects.forEach(s => {
    subjectMap.set(s.name.toLowerCase(), s.id);
    subjectMap.set(s.name, s.id);
  });

  // Parse GKA result lines
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  const gkLines = gkSql.split('\n').filter(l => 
    l.trim().startsWith('(') && l.includes("'greatkings/") && 
    l.includes("'2025/2026'") && l.includes("'second'")
  );

  console.log(`GKA result lines to process: ${gkLines.length}`);

  // Sample line format: (id, student_id, class, course, session, term, first_term_score, second_term_score, ...)
  // Columns: result_id(0), student_id(1), class(2), course(3), session(4), term(5), first_term_score(6), second_term_score(7), test_score(8), exam_score(9), ...
  
  let migrated = 0;
  for (const line of gkLines) {
    const parts = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "'") inQuote = !inQuote;
      else if (char === ',' && !inQuote) {
        parts.push(current.trim().replace(/^'|'$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current.trim().replace(/^'|'$/g, ''));

    const studentId = studentMap.get(parts[1]);
    const course = parts[3];
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (studentId && subjectId && gkaTermId) {
      const testScore = parseFloat(parts[8]) || 0;
      const examScore = parseFloat(parts[9]) || 0;
      const total = parseFloat(parts[10]) || (testScore + examScore);
      const grade = parts[11] || 'F';

      try {
        await conn.execute(
          'INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore, grade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [studentId, subjectId, gkaSessId, gkaTermId, testScore, examScore, total, grade]
        );
        migrated++;
      } catch (e) { /* duplicate */ }
    }
  }

  console.log(`Migrated ${migrated} GKA SECOND term results`);

  // Do the same for Florieren
  const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');
  const flLines = flSql.split('\n').filter(l => 
    l.trim().startsWith('(') && l.includes("'fpis/") && 
    l.includes("'2025/2026'") && l.includes("'second'")
  );

  console.log(`Florieren result lines: ${flLines.length}`);

  let migrated2 = 0;
  for (const line of flLines) {
    const parts = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "'") inQuote = !inQuote;
      else if (char === ',' && !inQuote) {
        parts.push(current.trim().replace(/^'|'$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current.trim().replace(/^'|'$/g, ''));

    const studentId = studentMap.get(parts[1]);
    const course = parts[3];
    const subjectId = subjectMap.get(course?.toLowerCase());

    if (studentId && subjectId && flTermId) {
      const testScore = parseFloat(parts[8]) || 0;
      const examScore = parseFloat(parts[9]) || 0;
      const total = parseFloat(parts[10]) || (testScore + examScore);

      try {
        await conn.execute(
          'INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [studentId, subjectId, flSessId, flTermId, testScore, examScore, total]
        );
        migrated2++;
      } catch (e) { /* duplicate */ }
    }
  }

  console.log(`Migrated ${migrated2} Florieren SECOND term results`);

  // Final check
  const [final] = await conn.execute(`
    SELECT s.name, t.name, COUNT(r.id) as cnt
    FROM Result r
    JOIN AcademicSession s ON r.sessionId = s.id
    JOIN AcademicTerm t ON r.termId = t.id
    WHERE s.name = '2025/2026'
    GROUP BY r.sessionId, r.termId
  `);
  console.log('\n2025/2026 final breakdown:');
  final.forEach(r => console.log(`  ${r.name} ${r.name}: ${r.cnt} results`));

  await conn.end();
})();