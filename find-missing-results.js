const fs = require('fs');
const mysql = require('mysql2/promise');
const DB_URL = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';

async function main() {
  const conn = await mysql.createConnection(DB_URL);

  // ── 1. Parse legacy SQL for ALL result rows ───────────────────────────────
  console.log('Parsing legacy SQL...');
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
  const legacyResults = [];

  while ((m = tupleRegex.exec(allResultData)) !== null) {
    const fields = m[1].split(',').map(f => f.trim().replace(/^'|'$/g, ''));
    if (fields.length < 12) continue;
    const [result_id, teacher_id, student_id, cls, course, session, term,
           first_term_score, second_term_score, test_score, exam_score, total_score] = fields;
    if (!student_id || !student_id.startsWith('greatkings/')) continue;
    if (!course || !session || !term) continue;

    // Only keep clean numeric scores
    const testClean  = test_score  && !test_score.includes('<')  && !isNaN(Number(test_score))  ? Number(test_score)  : null;
    const examClean  = exam_score  && !exam_score.includes('<')  && !isNaN(Number(exam_score))  ? Number(exam_score)  : null;
    const totalClean = total_score && !total_score.includes('<') && !isNaN(Number(total_score)) ? Number(total_score) : null;

    legacyResults.push({ student_id, class: cls, course, session, term, test: testClean, exam: examClean, total: totalClean });
  }
  console.log(`Parsed ${legacyResults.length} legacy result rows`);

  // ── 2. Get all greatkings students from Railway ───────────────────────────
  const [students] = await conn.execute(`
    SELECT u.uniqueId, st.id as studentId, cr.name as class
    FROM User u
    JOIN Student st ON st.userId = u.id
    LEFT JOIN ClassRoom cr ON cr.id = st.classRoomId
    WHERE u.schoolId = 9
  `);
  const studentMap = new Map(students.map(s => [s.uniqueId, s]));
  console.log(`Railway students: ${students.length}`);

  // ── 3. Get all sessions & terms for school 9 ─────────────────────────────
  const [sessions] = await conn.execute('SELECT id, name FROM AcademicSession WHERE schoolId = 9');
  const [terms]    = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm WHERE schoolId = 9');
  const sessionMap = new Map(sessions.map(s => [s.name, s.id]));

  function getTermId(sessionName, termName) {
    const sessionId = sessionMap.get(sessionName);
    if (!sessionId) return null;
    const t = terms.find(t => t.sessionId === sessionId && t.name.toUpperCase() === termName.toUpperCase());
    return t ? t.id : null;
  }

  // ── 4. Get all subjects ───────────────────────────────────────────────────
  const [subjects] = await conn.execute('SELECT id, name, classRoomId FROM Subject');
  // prefer null-classRoomId subjects as they are the "global" ones used for GK
  function getSubjectId(name) {
    const nullRoom = subjects.find(s => s.name === name && s.classRoomId === null);
    if (nullRoom) return nullRoom.id;
    const any = subjects.find(s => s.name === name);
    return any ? any.id : null;
  }

  // ── 5. Get all existing Railway results for school 9 ─────────────────────
  const [existing] = await conn.execute(`
    SELECT r.studentId, r.subjectId, r.sessionId, r.termId
    FROM Result r
    JOIN Student st ON st.id = r.studentId
    JOIN User u ON u.id = st.userId
    WHERE u.schoolId = 9
  `);
  const existingSet = new Set(existing.map(r => `${r.studentId}_${r.subjectId}_${r.sessionId}_${r.termId}`));
  console.log(`Existing Railway results: ${existingSet.size}`);

  // ── 6. Find missing results ───────────────────────────────────────────────
  const toInsert = [];
  const skippedReasons = { noStudent: 0, noSession: 0, noTerm: 0, noSubject: 0, alreadyExists: 0, noScores: 0, duplicate: 0 };
  const insertKeys = new Set();

  for (const row of legacyResults) {
    const student = studentMap.get(row.student_id);
    if (!student) { skippedReasons.noStudent++; continue; }

    const sessionId = sessionMap.get(row.session);
    if (!sessionId) { skippedReasons.noSession++; continue; }

    const termId = getTermId(row.session, row.term);
    if (!termId) { skippedReasons.noTerm++; continue; }

    const subjectId = getSubjectId(row.course);
    if (!subjectId) { skippedReasons.noSubject++; continue; }

    const key = `${student.studentId}_${subjectId}_${sessionId}_${termId}`;
    if (existingSet.has(key)) { skippedReasons.alreadyExists++; continue; }
    if (insertKeys.has(key))  { skippedReasons.duplicate++; continue; }

    // Need at least a total score
    if (row.total === null && row.test === null && row.exam === null) { skippedReasons.noScores++; continue; }

    insertKeys.add(key);
    toInsert.push({ student, subjectId, sessionId, termId, row });
  }

  console.log(`\nTo insert: ${toInsert.length}`);
  console.log('Skipped reasons:', skippedReasons);

  if (toInsert.length === 0) {
    console.log('\nNothing to insert.');
    await conn.end();
    return;
  }

  // ── 7. Insert missing results ─────────────────────────────────────────────
  function gradeFromTotal(t) {
    if (t >= 75) return 'A1'; if (t >= 70) return 'B2'; if (t >= 65) return 'B3';
    if (t >= 60) return 'C4'; if (t >= 55) return 'C5'; if (t >= 50) return 'C6';
    if (t >= 45) return 'D7'; if (t >= 40) return 'E8'; return 'F9';
  }
  function remarkFromGrade(g) {
    const map = { A1: 'Excellent', B2: 'Very Good', B3: 'Good', C4: 'Credit', C5: 'Credit', C6: 'Credit', D7: 'Pass', E8: 'Pass', F9: 'Fail' };
    return map[g] || 'Fail';
  }

  let inserted = 0, failed = 0;
  for (const { student, subjectId, sessionId, termId, row } of toInsert) {
    const test  = row.test  ?? 0;
    const exam  = row.exam  ?? 0;
    const total = row.total ?? (test + exam);
    const grade  = gradeFromTotal(total);
    const remark = remarkFromGrade(grade);

    try {
      await conn.execute(
        'INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, totalScore, grade, remark, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [student.studentId, subjectId, sessionId, termId, test, exam, total, grade, remark]
      );
      inserted++;
      if (inserted % 100 === 0) console.log(`  Inserted ${inserted}...`);
    } catch (e) {
      failed++;
      if (failed <= 5) console.log(`  FAILED: ${row.student_id} ${row.course} ${row.session} ${row.term} — ${e.message}`);
    }
  }

  console.log(`\n✅ Done: ${inserted} inserted, ${failed} failed`);
  await conn.end();
}

main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
