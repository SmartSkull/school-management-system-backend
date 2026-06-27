const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function findTableInsert(table) {
  const pat = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const m = sql.match(pat);
  if (!m) return null;
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
  return { cols, firstRow: rows[0] || null, rowCount: rows.length };
}

for (const t of ['assignment', 'attendance', 'post']) {
  const r = findTableInsert(t);
  console.log(`\n=== ${t} ===`);
  console.log('Match:', r ? 'YES' : 'NO');
  if (r) {
    console.log('Cols:', r.cols);
    console.log('Rows:', r.rowCount);
    console.log('First row sample:', r.firstRow ? r.firstRow.substring(0, 200) : 'null');
  }
}
