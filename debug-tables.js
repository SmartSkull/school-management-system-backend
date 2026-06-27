const fs = require('fs');
const SQL_PATH = 'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql';

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
      if (ch === "'" || ch === '"') { ins = true; sc = ch; cur = ch; }
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

function main() {
  const tables = [
    { name: 'assignment', fields: ['staff_id', 'subject', 'class', 'assignment', 'deadline'] },
    { name: 'attendance', fields: ['student_id', 'present', 'absent', 'comment', 'session', 'term'] },
    { name: 'result', fields: ['teacher_id', 'student_id', 'course', 'session', 'term', 'test_score', 'exam_score', 'total_score', 'grade'] },
    { name: 'post', fields: ['admin_id', 'image', 'text', 'user'] },
    { name: 'comment', fields: ['post_id', 'comment', 'unique_id'] },
    { name: 'likes', fields: ['post_id', 'unique_id'] },
    { name: 'scratch_card', fields: ['student_id', 'transfer_amount', 'session', 'term', 'verified'] },
  ];
  
  for (const t of tables) {
    const { cols, rows } = parseTable(t.name);
    console.log(`\n=== ${t.name} ===`);
    console.log('Cols:', cols);
    console.log('Rows:', rows.length);
    if (rows.length > 0) {
      const sample = rows[0];
      for (const f of t.fields) {
        const idx = cols.indexOf(f);
        console.log(`  ${f}: ${idx >= 0 ? sample[idx] : 'NOT FOUND'}`);
      }
    }
  }
}
main();
