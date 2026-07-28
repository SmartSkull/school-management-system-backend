const fs = require('fs');

const content = fs.readFileSync('greatkin_gk.sql', 'utf8');
const lines = content.split('\n');

let inResultBlock = false;
let resultLines = [];

for (const line of lines) {
  if (line.trim().startsWith('INSERT INTO `result`')) inResultBlock = true;
  if (inResultBlock) {
    resultLines.push(line);
    if (line.trim().endsWith(';')) inResultBlock = false;
  }
}

const allResultData = resultLines.join('\n');
const tupleRegex = /\(([^)]+)\)/g;
let m;
const jss1Computer = [];
const allJSS1First2025 = {};

while ((m = tupleRegex.exec(allResultData)) !== null) {
  const val = m[1];
  const fields = val.split(',').map(f => f.trim().replace(/^'|'$/g, ''));
  if (fields.length < 10) continue;

  // Fields: result_id, teacher_id, student_id, class, course, session, term,
  //         first_term_score, second_term_score, test_score, exam_score, total_score, ...
  const [result_id, teacher_id, student_id, cls, course, session, term, first_term_score, second_term_score, test_score, exam_score, total_score] = fields;

  if (!session || !session.includes('2025')) continue;
  if (!term || term.toLowerCase() !== 'first') continue;
  if (!cls || !cls.toLowerCase().includes('jss1')) continue;

  // Track all subjects for JSS1 2025/2026 first
  allJSS1First2025[course] = (allJSS1First2025[course] || 0) + 1;

  if (course && course.toLowerCase() === 'computer') {
    // Skip corrupted score fields
    const totalClean = total_score && !total_score.includes('<') ? total_score : null;
    const testClean = test_score && !test_score.includes('<') ? test_score : null;
    const examClean = exam_score && !exam_score.includes('<') ? exam_score : null;

    jss1Computer.push({
      result_id, student_id, class: cls, course, session, term,
      test_score: testClean, exam_score: examClean, total_score: totalClean
    });
  }
}

console.log(`JSS1 Computer results in 2025/2026 FIRST term: ${jss1Computer.length}`);
if (jss1Computer.length > 0) {
  console.log('All records:');
  jss1Computer.forEach(r => console.log(`  student=${r.student_id} class=${r.class} test=${r.test_score} exam=${r.exam_score} total=${r.total_score}`));
} else {
  console.log('\nAll subjects found for JSS1 in 2025/2026 FIRST:');
  Object.entries(allJSS1First2025).sort().forEach(([s, c]) => console.log(`  ${s}: ${c}`));
}
