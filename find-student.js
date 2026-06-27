const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
const regex = /INSERT INTO `users`.*?VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i;
const match = sql.match(regex);
const values = match[1];
const rows = [];
const rowRegex = /\(([^)]+)\)/g;
let m;
while ((m = rowRegex.exec(values)) !== null) {
  const v = m[1];
  const parts = [];
  let cur = '', inStr = false, sc = '';
  for (let i = 0; i < v.length; i++) {
    if (inStr) {
      if (v[i] === sc && v[i-1] !== '\\') inStr = false;
      cur += v[i];
    } else {
      if (v[i] === "'" || v[i] === '"') { inStr = true; sc = v[i]; cur += v[i]; }
      else if (v[i] === ',') { parts.push(cur.trim()); cur = ''; }
      else cur += v[i];
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  if (parts.some(p => p.includes('student/2022/3483'))) console.log(parts.join(' | '));
}
