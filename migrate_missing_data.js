/**
 * migrate_missing_data.js
 *
 * Migrates missing Results and CBT questions from the two source SQL files
 * (greatkin_gk.sql, greatkin_florieren.sql) into the Railway DB.
 *
 * Run: node migrate_missing_data.js
 *
 * Safe to re-run — uses INSERT IGNORE / upsert semantics where possible.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');

// ── DB connection ─────────────────────────────────────────────────────────────
const url = process.env.DATABASE_URL;
const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
if (!m) { console.error('Could not parse DATABASE_URL'); process.exit(1); }
const [, user, password, host, port, database] = m;

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseFloat2(v) {
  if (!v || v === '-' || v.trim() === '') return 0;
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function normaliseCourseName(name) {
  if (!name) return '';
  return name.trim()
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function normaliseTermName(t) {
  if (!t) return null;
  const v = t.trim().toLowerCase();
  if (v === 'first'  || v === '1st') return 'FIRST';
  if (v === 'second' || v === '2nd') return 'SECOND';
  if (v === 'third'  || v === '3rd') return 'THIRD';
  return v.toUpperCase();
}

/**
 * Parse INSERT rows from a SQL dump block.
 * Returns array of objects keyed by column name.
 */
function parseInserts(sql, tableName) {
  const rows = [];
  // Match the INSERT block for this specific table
  const re = new RegExp(
    `INSERT INTO [^\`]?\`?${tableName}\`?[^\`]*?\\(([^)]+)\\)\\s+VALUES\\s+([\\s\\S]+?)(?=;\\s*(?:--|/\\*|INSERT|CREATE|DROP|ALTER|$))`,
    'gi'
  );

  let match;
  while ((match = re.exec(sql)) !== null) {
    const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
    const valuesBlock = match[2];

    // Parse each tuple (handles nested parens in strings)
    let i = 0;
    while (i < valuesBlock.length) {
      // find next opening paren
      while (i < valuesBlock.length && valuesBlock[i] !== '(') i++;
      if (i >= valuesBlock.length) break;
      i++; // skip (

      const values = [];
      let current = '';
      let depth = 1;
      let inStr = false;
      let strChar = '';

      while (i < valuesBlock.length && depth > 0) {
        const c = valuesBlock[i];
        if (inStr) {
          if (c === '\\') {
            current += c + (valuesBlock[i + 1] || '');
            i += 2;
            continue;
          }
          if (c === strChar) { inStr = false; }
          else { current += c; }
        } else {
          if (c === "'" || c === '"') {
            inStr = true;
            strChar = c;
          } else if (c === '(') {
            depth++;
            current += c;
          } else if (c === ')') {
            depth--;
            if (depth === 0) {
              values.push(current.trim());
              break;
            }
            current += c;
          } else if (c === ',' && depth === 1) {
            values.push(current.trim());
            current = '';
          } else {
            current += c;
          }
        }
        i++;
      }

      if (values.length > 0) {
        const row = {};
        cols.forEach((col, idx) => {
          let val = values[idx] ?? '';
          // Strip surrounding quotes
          if ((val.startsWith("'") && val.endsWith("'")) ||
              (val.startsWith('"') && val.endsWith('"'))) {
            val = val.slice(1, -1)
              .replace(/\\'/g, "'")
              .replace(/\\"/g, '"')
              .replace(/\\\\/g, '\\')
              .replace(/\\n/g, '\n')
              .replace(/\\r/g, '\r');
          }
          if (val === 'NULL') val = null;
          row[col] = val;
        });
        rows.push(row);
      }
      i++;
    }
  }
  return rows;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connecting to Railway DB...');
  const conn = await mysql.createConnection({
    host, port: parseInt(port), user, password, database,
    ssl: { rejectUnauthorized: false },
    multipleStatements: false,
  });

  // ── Load lookup maps from DB ─────────────────────────────────────────────────
  console.log('Loading lookup tables...');

  // uniqueId → { studentId, classRoomId }
  const [studentRows] = await conn.query(`
    SELECT s.id as studentId, u.uniqueId, s.classRoomId
    FROM Student s JOIN User u ON u.id = s.userId
  `);
  const studentByUniqueId = {};
  for (const r of studentRows) {
    studentByUniqueId[r.uniqueId] = { studentId: r.studentId, classRoomId: r.classRoomId };
  }

  // uniqueId → staffId
  const [staffRows] = await conn.query(`
    SELECT s.id as staffId, u.uniqueId
    FROM Staff s JOIN User u ON u.id = s.userId
  `);
  const staffByUniqueId = {};
  for (const r of staffRows) staffByUniqueId[r.uniqueId] = r.staffId;

  // session name → { id, schoolId }
  const [sessionRows] = await conn.query('SELECT id, schoolId, name FROM AcademicSession');
  const sessionByName = {};
  for (const r of sessionRows) {
    const key = `${r.schoolId}:${r.name}`;
    sessionByName[key] = r.id;
    sessionByName[r.name] = r.id; // fallback without schoolId
  }

  // sessionId + termName → termId
  const [termRows] = await conn.query('SELECT id, sessionId, name FROM AcademicTerm');
  const termBySessionAndName = {};
  for (const r of termRows) termBySessionAndName[`${r.sessionId}:${r.name}`] = r.id;

  // classRoomId + subjectName → subjectId (normalised name)
  const [subjectRows] = await conn.query('SELECT id, classRoomId, name FROM Subject');
  const subjectByClassAndName = {};
  for (const r of subjectRows) {
    const key = `${r.classRoomId}:${normaliseCourseName(r.name)}`;
    subjectByClassAndName[key] = r.id;
    // Also index by just name (no class) as fallback
    const nameKey = normaliseCourseName(r.name);
    if (!subjectByClassAndName[nameKey]) subjectByClassAndName[nameKey] = r.id;
  }

  // classRoom name → id
  const [classRows] = await conn.query('SELECT id, name FROM ClassRoom');
  const classRoomByName = {};
  for (const r of classRows) classRoomByName[r.name.toLowerCase().trim()] = r.id;

  // Existing results: Set of "studentId:subjectId:sessionId:termId"
  const [existingResults] = await conn.query(
    'SELECT studentId, subjectId, sessionId, termId FROM Result'
  );
  const existingResultKeys = new Set(
    existingResults.map(r => `${r.studentId}:${r.subjectId}:${r.sessionId}:${r.termId}`)
  );

  // Existing CBT questions: set of "testId:question" hashes  
  const [existingQRows] = await conn.query('SELECT testId, question FROM CbtQuestion');
  const existingQKeys = new Set(existingQRows.map(r => `${r.testId}:${r.question.substring(0, 80)}`));

  // CbtTest: classRoomId + subjectId + sessionId + termId → testId
  const [testRows] = await conn.query(
    'SELECT id, classRoomId, subjectId, sessionId, termId, durationMin FROM CbtTest'
  );
  const testByKey = {};
  for (const r of testRows) testByKey[`${r.classRoomId}:${r.subjectId}:${r.sessionId}:${r.termId}`] = r.id;

  console.log(`  Loaded ${studentRows.length} students, ${staffRows.length} staff`);
  console.log(`  ${sessionRows.length} sessions, ${termRows.length} terms`);
  console.log(`  ${subjectRows.length} subjects, ${classRows.length} classrooms`);
  console.log(`  ${existingResults.length} existing results, ${existingQRows.length} existing CBT questions`);

  // ── Read SQL files ──────────────────────────────────────────────────────────
  console.log('\nReading SQL files...');
  const gkSql  = fs.readFileSync('greatkin_gk.sql',       'utf8', { encoding: 'utf8' });
  const flSql  = fs.readFileSync('greatkin_florieren.sql', 'utf8', { encoding: 'utf8' });

  // ── Migrate Results ─────────────────────────────────────────────────────────
  console.log('\n── Migrating Results ──');

  const allResults = [
    ...parseInserts(gkSql, 'result'),
    ...parseInserts(flSql, 'result'),
  ];
  console.log(`  Parsed ${allResults.length} result rows from SQL files`);

  let resultInserted = 0, resultSkipped = 0, resultFailed = 0;
  const resultFailReasons = {};
  const toInsert = [];

  for (const r of allResults) {
    const studentUniqueId = r['student_id'];
    const studentInfo = studentByUniqueId[studentUniqueId];
    if (!studentInfo) {
      resultFailed++;
      resultFailReasons['student_not_found'] = (resultFailReasons['student_not_found'] || 0) + 1;
      continue;
    }

    const sessionName = r['session'];
    const sessionId = sessionByName[sessionName];
    if (!sessionId) {
      resultFailed++;
      resultFailReasons['session_not_found'] = (resultFailReasons['session_not_found'] || 0) + 1;
      continue;
    }

    const termNameNorm = normaliseTermName(r['term']);
    if (!termNameNorm) {
      resultFailed++;
      resultFailReasons['term_empty'] = (resultFailReasons['term_empty'] || 0) + 1;
      continue;
    }
    const termId = termBySessionAndName[`${sessionId}:${termNameNorm}`];
    if (!termId) {
      resultFailed++;
      resultFailReasons['term_not_found'] = (resultFailReasons['term_not_found'] || 0) + 1;
      continue;
    }

    // Find subject: try class-specific first, then fallback to just name
    const courseName = normaliseCourseName(r['course']);
    const classRoomId = studentInfo.classRoomId;
    let subjectId = subjectByClassAndName[`${classRoomId}:${courseName}`]
      ?? subjectByClassAndName[courseName];
    if (!subjectId) {
      resultFailed++;
      resultFailReasons['subject_not_found'] = (resultFailReasons['subject_not_found'] || 0) + 1;
      continue;
    }

    const key = `${studentInfo.studentId}:${subjectId}:${sessionId}:${termId}`;
    if (existingResultKeys.has(key)) {
      resultSkipped++;
      continue;
    }

    const testScore  = parseFloat2(r['test_score']  ?? r['test_score_sixty'] ?? '0');
    const examScore  = parseFloat2(r['exam_score']  ?? r['test_score_forty'] ?? '0');
    const totalScore = parseFloat2(r['total_score'] ?? '0');
    const grade      = r['grade'] ?? null;
    const remark     = r['remark'] ?? null;
    const approved   = r['approved'] === '1';
    const approvedAt = approved ? (r['date'] ? new Date(r['date']) : new Date()) : null;
    const teacherUniqueId = r['teacher_id'];
    const teacherId = teacherUniqueId ? (staffByUniqueId[teacherUniqueId] ?? null) : null;

    toInsert.push([studentInfo.studentId, subjectId, teacherId, sessionId, termId,
      testScore, examScore, totalScore, grade, remark, approvedAt]);
    existingResultKeys.add(key);
  }

  console.log(`  ${toInsert.length} new rows to insert, ${resultSkipped} already exist, ${resultFailed} unmappable`);

  // Batch insert in chunks of 500
  const BATCH = 500;
  for (let i = 0; i < toInsert.length; i += BATCH) {
    const chunk = toInsert.slice(i, i + BATCH);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,?,NOW(),NOW())').join(',');
    const values = chunk.flat();
    try {
      await conn.execute(
        `INSERT IGNORE INTO Result (studentId,subjectId,teacherId,sessionId,termId,testScore,examScore,totalScore,grade,remark,approvedAt,createdAt,updatedAt) VALUES ${placeholders}`,
        values
      );
      resultInserted += chunk.length;
      process.stdout.write(`\r  Inserted ${resultInserted}/${toInsert.length}...`);
    } catch (e) {
      resultFailed += chunk.length;
      resultFailReasons[e.code ?? 'unknown'] = (resultFailReasons[e.code ?? 'unknown'] || 0) + chunk.length;
    }
  }
  console.log();

  console.log(`  ✓ Inserted: ${resultInserted}`);
  console.log(`  ○ Skipped (already exist): ${resultSkipped}`);
  console.log(`  ✗ Failed: ${resultFailed}`);
  if (Object.keys(resultFailReasons).length) {
    console.log('  Fail reasons:', resultFailReasons);
  }

  // ── Migrate CBT questions from old `cbt` table (greatkin_gk.sql) ────────────
  console.log('\n── Migrating CBT Questions (gk: `cbt` table) ──');

  const gkCbtRows = parseInserts(gkSql, 'cbt');
  console.log(`  Parsed ${gkCbtRows.length} CBT rows`);

  let cbtInserted = 0, cbtSkipped = 0, cbtFailed = 0;

  for (const row of gkCbtRows) {
    const className  = (row['class'] || '').trim().toLowerCase();
    const courseName = normaliseCourseName(row['course']);
    const classRoomId = classRoomByName[className];

    let subjectId = classRoomId
      ? (subjectByClassAndName[`${classRoomId}:${courseName}`] ?? subjectByClassAndName[courseName])
      : subjectByClassAndName[courseName];

    if (!classRoomId || !subjectId) { cbtFailed++; continue; }

    // Find or create a CbtTest for this class+subject (no session/term since old data has none)
    // Use sessionId=null, termId=null — find first test that matches class+subject
    let testId = null;
    for (const [k, tid] of Object.entries(testByKey)) {
      const [tClass, tSubject] = k.split(':');
      if (tClass == classRoomId && tSubject == subjectId) { testId = tid; break; }
    }

    if (!testId) {
      // Create a new CbtTest
      try {
        const dur = parseInt(row['duration']) || 30;
        const [res] = await conn.execute(
          `INSERT INTO CbtTest (classRoomId, subjectId, title, durationMin, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, NOW(), NOW())`,
          [classRoomId, subjectId, `${row['course']} – ${row['class']}`, dur]
        );
        testId = res.insertId;
        testByKey[`${classRoomId}:${subjectId}:null:null`] = testId;
      } catch { cbtFailed++; continue; }
    }

    const qKey = `${testId}:${(row['question'] || '').substring(0, 80)}`;
    if (existingQKeys.has(qKey)) { cbtSkipped++; continue; }

    // Map old answer (could be option text or A/B/C/D)
    const rawAnswer = (row['answer'] || '').trim();
    let answer = 'A';
    if (['A','B','C','D'].includes(rawAnswer.toUpperCase())) {
      answer = rawAnswer.toUpperCase();
    } else {
      // Try matching answer text to options
      const opts = [row['option1'], row['option2'], row['option3'], row['option4']];
      const idx = opts.findIndex(o => o && o.trim() === rawAnswer);
      if (idx >= 0) answer = ['A','B','C','D'][idx];
    }

    try {
      await conn.execute(
        `INSERT INTO CbtQuestion (testId, question, optionA, optionB, optionC, optionD, answer, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [testId, row['question'], row['option1'] ?? '', row['option2'] ?? '',
         row['option3'] ?? null, row['option4'] ?? null, answer]
      );
      existingQKeys.add(qKey);
      cbtInserted++;
    } catch (e) {
      if (e.code === 'ER_DUP_ENTRY') cbtSkipped++;
      else cbtFailed++;
    }
  }

  console.log(`  ✓ Inserted: ${cbtInserted}`);
  console.log(`  ○ Skipped: ${cbtSkipped}`);
  console.log(`  ✗ Failed: ${cbtFailed}`);

  // ── Migrate CBT questions from florieren `test` table ───────────────────────
  console.log('\n── Migrating CBT Questions (florieren: `test` table) ──');

  const flTestRows = parseInserts(flSql, 'test');
  console.log(`  Parsed ${flTestRows.length} test rows`);

  let flInserted = 0, flSkipped = 0, flFailed = 0;
  const flToInsert = [];

  for (const row of flTestRows) {
    const studentUniqueId = row['student_id'];
    const studentInfo = studentByUniqueId[studentUniqueId];
    const sessionName = row['session'];
    const termNameNorm = normaliseTermName(row['term']);
    const courseName = normaliseCourseName(row['course']);

    const sessionId = sessionByName[sessionName];
    const termId = sessionId ? termBySessionAndName[`${sessionId}:${termNameNorm}`] : null;
    const classRoomId = studentInfo?.classRoomId ?? null;

    let subjectId = classRoomId
      ? (subjectByClassAndName[`${classRoomId}:${courseName}`] ?? subjectByClassAndName[courseName])
      : subjectByClassAndName[courseName];

    if (!subjectId || !classRoomId || !studentInfo || !sessionId || !termId) {
      flFailed++;
      continue;
    }

    const key = `${studentInfo.studentId}:${subjectId}:${sessionId}:${termId}`;
    if (existingResultKeys.has(key)) { flSkipped++; continue; }

    const testScore  = parseFloat2(row['test_score_sixty']);
    const examScore  = parseFloat2(row['test_score_forty']);
    const totalScore = parseFloat2(row['total_score']);
    const grade      = row['grade'] ?? null;
    const remark     = row['remark'] ?? null;

    flToInsert.push([studentInfo.studentId, subjectId, null, sessionId, termId,
      testScore, examScore, totalScore, grade, remark]);
    existingResultKeys.add(key);
  }

  console.log(`  ${flToInsert.length} new rows to insert, ${flSkipped} already exist, ${flFailed} unmappable`);

  for (let i = 0; i < flToInsert.length; i += 500) {
    const chunk = flToInsert.slice(i, i + 500);
    const placeholders = chunk.map(() => '(?,?,?,?,?,?,?,?,?,?,NULL,NOW(),NOW())').join(',');
    try {
      await conn.execute(
        `INSERT IGNORE INTO Result (studentId,subjectId,teacherId,sessionId,termId,testScore,examScore,totalScore,grade,remark,approvedAt,createdAt,updatedAt) VALUES ${placeholders}`,
        chunk.flat()
      );
      flInserted += chunk.length;
      process.stdout.write(`\r  Inserted ${flInserted}/${flToInsert.length}...`);
    } catch (e) {
      flFailed += chunk.length;
    }
  }
  console.log();

  console.log(`  ✓ Inserted: ${flInserted}`);
  console.log(`  ○ Skipped: ${flSkipped}`);
  console.log(`  ✗ Failed: ${flFailed}`);

  // ── Final counts ─────────────────────────────────────────────────────────────
  console.log('\n── Final DB Counts ──');
  const [[{ resultCount }]] = await conn.query('SELECT COUNT(*) as resultCount FROM Result');
  const [[{ cbtCount }]]    = await conn.query('SELECT COUNT(*) as cbtCount FROM CbtQuestion');
  console.log(`  Result:      ${resultCount} rows`);
  console.log(`  CbtQuestion: ${cbtCount} rows`);
  console.log('\nDone ✓');

  await conn.end();
}

main().catch(e => { console.error('\n✗ Migration failed:', e.message); process.exit(1); });
