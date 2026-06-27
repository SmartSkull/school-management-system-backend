const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

const m = sql.match(/INSERT INTO `assignment`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i);
if (!m) { console.log('No match'); process.exit(); }

const vb = m[2].trim();
console.log('Values block length:', vb.length);

let cur = '', ins = false, sc = "'";
const rawRows = [];
for (let i = 0; i < vb.length; i++) {
  const ch = vb[i];
  if (ins) {
    if (ch === sc && cur[cur.length - 1] === '\\') cur = cur.slice(0, -1) + ch;
    else { cur += ch; if (ch === sc) ins = false; }
  } else {
    if (ch === "'" || ch === '"') { ins = true; sc = ch; cur = ch; }
    else if (ch === '(') {
      cur = '';
    }
    else if (ch === ')' && cur.trim()) { rawRows.push(cur.trim()); }
    else cur += ch;
  }
}

console.log('Raw rows:', rawRows.length);
for (let i = 0; i < Math.min(5, rawRows.length); i++) {
  console.log(`Row ${i}: ${rawRows[i].substring(0, 120)}`);
}
