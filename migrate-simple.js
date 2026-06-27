const mysql = require('mysql2/promise');
const fs = require('fs');

const DB = {
  host: 'yamabiko.proxy.rlwy.net', port: 29012,
  user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
};
const SCHOOL_ID = 9;
const SKIP = new Set(['admin/2022/3a18', 'admin', 'admin1']);

function uq(v) {
  if (v == null) return null;
  v = String(v).trim();
  if (v.toLowerCase() === 'null') return null;
  if ((v.startsWith(\"' \") && v.endsWith(\"' \")) || (v.startsWith('\"') && v.endsWith('\"'))) return v.slice(1, -1);
  return v;
}

function parse(table) {
  const re = new RegExp('INSERT INTO ' + table + '\\\\s*\\\\(([^)]+)\\\\)\\\\s*VALUES\\\\s*([\\\\s\\\\S]*?);(?=\\\\s*--|\\\\s*INSERT|\\\\s*CREATE|\\\\s*$)', 'i');
  const m = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8').match(re);
  if (!m) return { cols: [], rows: [] };
  const cols = m[1].split(',').map(c => c.trim().replace(//g, ''));
  const vb = m[2].trim();
  if (!vb) return { cols, rows: [] };
  const rows = [];
  let cur = '', ins = false, sc = '';
  for (let i = 0; i < vb.length; i++) {
    const ch = vb[i];
    if (ins) { if (ch === sc && vb[i-1] !== '\\\\') ins = false; cur += ch; }
    else {
      if (ch === \"'\" || ch === '\"') { ins = true; sc = ch; cur += ch; }
      else if (ch === '(') { cur = ''; }
      else if (ch === ')' && cur.trim()) { rows.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
  }
  const out = [];
  for (const rs of rows) {
    const v = [];
    let r = '', ri = false, rc = '';
    for (let i = 0; i < rs.length; i++) {
      const ch = rs[i];
      if (ri) { if (ch === rc && rs[i-1] !== '\\\\') ri = false; r += ch; }
      else {
        if (ch === \"'\" || ch === '\"') { ri = true; rc = ch; r += ch; }
        else if (ch === ',') { v.push(uq(r)); r = ''; }
        else r += ch;
      }
    }
    const last = uq(r);
    if (last != null && String(last).trim() !== '') v.push(last);
    if (v.length > 0) out.push(v);
  }
  return { cols, rows: out };
}

async function run() {
  const conn = await mysql.createConnection(DB);
  await conn.beginTransaction();
  try {
    const [eu] = await conn.execute('SELECT id, uniqueId FROM User');
    const um = {}; for (const u of eu) um[u.uniqueId] = u.id;
    const [es] = await conn.execute('SELECT userId FROM Staff');
    const su = new Set(es.map(x => x.userId));
    const [ev] = await conn.execute('SELECT userId FROM Student');
    const stv = new Set(ev.map(x => x.userId));
    
    const { cols: sc, rows: sr } = parse('staff');
    const { cols: uc, rows: ur } = parse('users');
    
    const stc = [], stuc = [];
    for (const r of sr) {
      const uid = uq(r[sc.indexOf('unique_id')]);
      if (SKIP.has(uid) || !uid || um[uid]) continue;
      stc.push(r);
    }
    for (const r of ur) {
      const uid = uq(r[uc.indexOf('student_id')]);
      if (SKIP.has(uid) || !uid || um[uid]) continue;
      stuc.push(r);
    }
    console.log('Staff:', stc.length, 'Students:', stuc.length);
    
    for (const r of stc) {
      const id = uq(r[sc.indexOf('unique_id')]);
      const res = await conn.execute('INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())', [id, 'STAFF', uq(r[sc.indexOf('firstname')])||'Staff', uq(r[sc.indexOf('lastname')])||'', uq(r[sc.indexOf('email')]), uq(r[sc.indexOf('telephone')]), uq(r[sc.indexOf('password')])||'\\\', uq(r[sc.indexOf('image')]), 'ACTIVE']);
      um[id] = res[0].insertId;
    }
    for (const r of stuc) {
      const id = uq(r[uc.indexOf('student_id')]);
      const res = await conn.execute('INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())', [id, 'STUDENT', uq(r[uc.indexOf('firstname')])||'Student', uq(r[uc.indexOf('lastname')])||'', uq(r[uc.indexOf('email')]), uq(r[uc.indexOf('telephone')]), uq(r[uc.indexOf('password')])||'\\\', uq(r[uc.indexOf('image')]), 'ACTIVE']);
      um[id] = res[0].insertId;
    }
    console.log('Users done');
    
    const [ac] = await conn.execute('SELECT id, name FROM ClassRoom WHERE schoolId = ?', [SCHOOL_ID]);
    const cm = {}; for (const c of ac) cm[c.name] = c.id;
    const [gc] = await conn.execute('SELECT id, name FROM ClassRoom');
    for (const c of gc) cm[c.name] = c.id;
    
    for (const r of stc) {
      const id = uq(r[sc.indexOf('unique_id')]);
      const uid = um[id];
      if (!uid || su.has(uid)) continue;
      await conn.execute('INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())', [uid, id, uq(r[sc.indexOf('state_of_origin')]), uq(r[sc.indexOf('date_of_birth')])||null, uq(r[sc.indexOf('home_address')]), uq(r[sc.indexOf('about')])]);
    }
    for (const r of stuc) {
      const id = uq(r[uc.indexOf('student_id')]);
      const uid = um[id];
      if (!uid || stv.has(uid)) continue;
      const cn = uq(r[uc.indexOf('class')]);
      const cid = cn ? (cm[cn]||null) : null;
      await conn.execute('INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())', [uid, id, cid, uq(r[uc.indexOf('year_of_admission')]), uq(r[uc.indexOf('date_of_birth')])||null, uq(r[uc.indexOf('state_of_origin')]), uq(r[uc.indexOf('home_address')]), uq(r[uc.indexOf('father_name')]), uq(r[uc.indexOf('mother_name')]), uq(r[uc.indexOf('parent_image')]), uq(r[uc.indexOf('about'))]);
    }
    
    await conn.commit();
    console.log('DONE');
  } catch (e) {
    await conn.rollback();
    console.error('FAIL:', e.message);
  }
  await conn.end();
}
run();
