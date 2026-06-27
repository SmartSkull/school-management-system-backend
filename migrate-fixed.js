const mysql = require('mysql2/promise');
const fs = require('fs');

const DB = {
  host: 'yamabiko.proxy.rlwy.net', port: 29012,
  user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
};
const SQL_PATH = 'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql';
const SKIP_IDS = new Set(['admin/2022/3a18', 'admin', 'admin1']);

function tryParseDate(s) {
  if (!s) return null;
  s = s.trim();
  if (!s) return null;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function parseTable(table) {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const pat = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const m = sql.match(pat);
  if (!m) return { cols: [], rows: [] };
  const cols = m[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const vb = m[2].trim();
  const rows = [];
  let cur = '', ins = false, sc = "'";
  for (let i = 0; i < vb.length; i++) {
    const ch = vb[i];
    if (ins) {
      if (ch === sc && cur[cur.length - 1] === '\\') cur = cur.slice(0, -1) + ch;
      else { cur += ch; if (ch === sc) ins = false; }
    } else {
      if (ch === "'" || ch === '"') { ins = true; sc = ch; cur += ch; }
      else if (ch === '(') cur = '';
      else if (ch === ')' && cur.trim()) { rows.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
  }
  const out = [];
  for (const rs of rows) {
    const vals = [];
    let r = '', ri = false, rc = "'";
    for (let i = 0; i < rs.length; i++) {
      const ch = rs[i];
      if (ri) {
        if (ch === rc && r[r.length - 1] === '\\') r = r.slice(0, -1) + ch;
        else { r += ch; if (ch === rc) ri = false; }
      } else {
        if (ch === "'" || ch === '"') { ri = true; rc = ch; r = ch; }
        else if (ch === ',') { vals.push(r.trim().replace(/^['"]|['"]$/g, '')); r = ''; }
        else r += ch;
      }
    }
    const last = r.trim().replace(/^['"]|['"]$/g, '');
    if (last !== '') vals.push(last);
    while (vals.length < cols.length) vals.push('');
    if (vals.length > cols.length) vals = vals.slice(0, cols.length - 1).concat([vals.slice(cols.length - 1).join(',')]);
    if (vals.some(v => v !== '')) out.push(vals);
  }
  return { cols, rows: out };
}

async function run() {
  const conn = await mysql.createConnection(DB);
  await conn.beginTransaction();
  try {
    const [urows] = await conn.execute('SELECT id, uniqueId FROM User');
    const um = {}; for (const u of urows) um[u.uniqueId] = u.id;
    
    const [staffRows] = await conn.execute('SELECT id, userId, staffNo FROM Staff');
    const staffMap = {}; 
    const studentMap = {};
    for (const s of staffRows) {
      if (s.staffNo && um[s.staffNo]) staffMap[s.staffNo] = s.id;
    }
    
    const [stuRows] = await conn.execute('SELECT id, userId, studentNo FROM Student');
    for (const s of stuRows) {
      if (s.studentNo) studentMap[s.studentNo] = s.id;
    }
    
    const [crows] = await conn.execute('SELECT id, name FROM ClassRoom');
    const cm = {}; for (const c of crows) cm[c.name] = c.id;
    const [srows] = await conn.execute('SELECT id, name FROM Subject');
    const sm = {}; for (const s of srows) sm[s.name.toLowerCase()] = s.id;
    const [snrows] = await conn.execute('SELECT id, name FROM AcademicSession');
    const snm = {}; for (const s of snrows) snm[s.name] = s.id;
    const [trows] = await conn.execute('SELECT id, sessionId, name FROM AcademicTerm');
    const tm = {};
    for (const t of trows) {
      for (const [n, id] of Object.entries(snm)) {
        if (id === t.sessionId) { tm[n + '_' + t.name.toLowerCase()] = t.id; break; }
      }
    }

    // Assignment - staffId -> Staff.id
    console.log('Migrating assignment...');
    const { cols: ac, rows: ar } = parseTable('assignment');
    const am = {}; for (let i = 0; i < ac.length; i++) am[ac[i]] = i;
    let cnt = 0;
    for (const row of ar) {
      const uid = (row[am['staff_id']] || '').trim();
      const staffId = staffMap[uid];
      if (!staffId) continue;
      const subj = (row[am['subject']] || '').trim();
      const cls = (row[am['class']] || '').trim();
      const content = (row[am['assignment']] || '').trim();
      const deadline = tryParseDate(row[am['deadline']]);
      if (!subj) continue;
      await conn.execute(
        'INSERT INTO Assignment (staffId, classRoomId, subjectId, title, content, dueAt, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [staffId, cm[cls] || null, sm[subj.toLowerCase()] || null, subj, content, deadline, 'PUBLISHED']
      );
      cnt++;
    }
    await conn.commit();
    console.log(`  Assignment: ${cnt}`);

    // Attendance - studentId -> Student.id
    console.log('Migrating attendance...');
    const { cols: attc, rows: attr } = parseTable('attendance');
    const attm = {}; for (let i = 0; i < attc.length; i++) attm[attc[i]] = i;
    cnt = 0;
    for (const row of attr) {
      const sid = (row[attm['student_id']] || '').trim();
      const studentId = studentMap[sid];
      if (!studentId) continue;
      const present = parseInt(row[attm['present']]) || 0;
      const absent = parseInt(row[attm['absent']]) || 0;
      const session = (row[attm['session']] || '').trim();
      const term = (row[attm['term']] || '').trim();
      if (!session || !term) continue;
      const tkey = session + '_' + term.toLowerCase();
      await conn.execute(
        'INSERT IGNORE INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [studentId, snm[session] || null, tm[tkey] || null, present, absent, row[attm['comment']] || null, row[attm['principal_comment']] || null]
      );
      cnt++;
    }
    await conn.commit();
    console.log(`  Attendance: ${cnt}`);

    // Result - studentId -> Student.id, teacherId -> Staff.id
    console.log('Migrating result...');
    const { cols: rc, rows: rr } = parseTable('result');
    const rm = {}; for (let i = 0; i < rc.length; i++) rm[rc[i]] = i;
    cnt = 0;
    for (const row of rr) {
      const tid = (row[rm['teacher_id']] || '').trim();
      const sid = (row[rm['student_id']] || '').trim();
      const teacherId = staffMap[tid];
      const studentId = studentMap[sid];
      if (!teacherId || !studentId) continue;
      const subj = (row[rm['course']] || '').trim();
      const session = (row[rm['session']] || '').trim();
      const term = (row[rm['term']] || '').trim();
      const t = parseFloat(row[rm['test_score']]) || 0;
      const e = parseFloat(row[rm['exam_score']]) || 0;
      const tot = parseFloat(row[rm['total_score']]) || Math.round((t + e) * 100) / 100;
      const grade = row[rm['grade']] || null;
      const sid_subj = sm[subj.toLowerCase()];
      const sid_session = snm[session];
      const sid_term = tm[session + '_' + term.toLowerCase()];
      if (!sid_subj || !sid_session || !sid_term) continue;
      await conn.execute(
        'INSERT INTO Result (studentId, subjectId, teacherId, sessionId, termId, testScore, examScore, totalScore, grade, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [studentId, sid_subj, teacherId, sid_session, sid_term, t, e, tot, grade]
      );
      cnt++;
    }
    await conn.commit();
    console.log(`  Result: ${cnt}`);

    // ScratchCard - studentId -> Student.id
    console.log('Migrating scratch_card...');
    const { cols: scc, rows: scr } = parseTable('scratch_card');
    const scm = {}; for (let i = 0; i < scc.length; i++) scm[scc[i]] = i;
    cnt = 0;
    for (const row of scr) {
      const sid = (row[scm['student_id']] || '').trim();
      const studentId = studentMap[sid];
      if (!studentId) continue;
      const amount = parseFloat(row[scm['transfer_amount']]) || 0;
      const session = (row[scm['session']] || '').trim();
      const term = (row[scm['term']] || '').trim();
      const verified = (row[scm['verified']] || '').trim();
      const status = verified === '1' ? 'USED' : 'PENDING';
      const tkey = session + '_' + term.toLowerCase();
      await conn.execute(
        'INSERT INTO ScratchCard (studentId, amount, status, sessionId, termId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, NOW(), NOW())',
        [studentId, amount, status, snm[session] || null, tm[tkey] || null]
      );
      cnt++;
    }
    await conn.commit();
    console.log(`  ScratchCard: ${cnt}`);

    // SchoolDays
    console.log('Migrating school_days...');
    const { cols: dc, rows: dr } = parseTable('school_days');
    const dm = {}; for (let i = 0; i < dc.length; i++) dm[dc[i]] = i;
    cnt = 0;
    for (const row of dr) {
      const session = (row[dm['session']] || '').trim();
      const term = (row[dm['term']] || '').trim();
      const days = parseInt(row[dm['total_days']]) || 0;
      const sid_session = snm[session];
      const sid_term = tm[session + '_' + term.toLowerCase()];
      if (sid_session && sid_term) {
        await conn.execute('INSERT INTO SchoolDays (session, term, totalDays, createdAt, updatedAt) VALUES (?, ?, ?, NOW(), NOW())',
          [session, term, days]);
        cnt++;
      }
    }
    await conn.commit();
    console.log(`  SchoolDays: ${cnt}`);

    console.log('\n=== REST MIGRATION COMPLETE ===');
  } catch (e) {
    await conn.rollback();
    console.error('FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
  await conn.end();
}

run().catch(e => console.error(e));
