const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

const m = sql.match(/INSERT INTO `assignment`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i);
if (!m) { console.log('No match'); process.exit(); }

const vb = m[2].trim();
console.log('Values block length:', vb.length);
console.log('First 200 chars:', vb.substring(0, 200));

let inStr = false, strCh = "'", cur = '';
const rows = [];
for (let i = 0; i < vb.length; i++) {
  const ch = vb[i];
  if (inStr) {
    if (ch === strCh && vb[i-1] !== '\\') inStr = false;
    cur += ch;
  } else {
    if (ch === "'" || ch === '"') { inStr = true; strCh = ch; cur += ch; }
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

console.log('Rows found:', rows.length);
if (rows.length > 0) {
  console.log('First row:', rows[0].substring(0, 200));
  console.log('Second row:', rows[1] ? rows[1].substring(0, 200) : 'none');
}
