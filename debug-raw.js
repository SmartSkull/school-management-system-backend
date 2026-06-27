const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function parseTable(table) {
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
      else if (ch === '(') {
        if (cur.trim() !== '') rows.push(cur.trim());
        cur = '';
      }
      else if (ch === ')' && cur.trim()) { 
        rows.push(cur.trim()); 
        cur = ''; 
      }
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
  return { cols, rows: out, rawRows: rows };
}

const { cols, rows, rawRows } = parseTable('assignment');
console.log('Cols:', cols);
console.log('Raw rows:', rawRows.length);
console.log('First 3 raw rows:');
for (let i = 0; i < Math.min(3, rawRows.length); i++) {
  console.log(`  Raw ${i}: ${rawRows[i].substring(0, 150)}`);
}
console.log('Parsed rows:', rows.length);
if (rows.length > 0) {
  console.log('First parsed row sample:', rows[0].slice(0, 5));
}
