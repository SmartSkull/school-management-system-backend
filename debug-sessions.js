const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
const m = sql.match(/INSERT INTO `attendance`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i);
if (m) {
  const vb = m[2].trim();
  let cur = '', ins = false, sc = "'";
  const rows = [];
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
  
  const sessions = new Set();
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
    while (vals.length < 14) vals.push('');
    if (vals.some(v => v !== '')) {
      sessions.add(vals[7]); // session column
    }
  }
  console.log('Unique sessions in attendance:');
  for (const s of sessions) console.log('  ', JSON.stringify(s));
}
