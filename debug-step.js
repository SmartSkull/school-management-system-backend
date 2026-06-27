const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

const m = sql.match(/INSERT INTO `assignment`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i);
if (!m) { console.log('No match'); process.exit(); }

const vb = m[2].trim();
console.log('VB length:', vb.length);
console.log('VB first 100:', JSON.stringify(vb.substring(0, 100)));

const rows = [];
let cur = '', inStr = false, sc = "'";
for (let i = 0; i < vb.length; i++) {
  const ch = vb[i];
  if (inStr) {
    if (ch === sc && vb[i-1] !== '\\') inStr = false;
    cur += ch;
  } else {
    if (ch === "'" || ch === '"') { inStr = true; sc = ch; cur += ch; }
    else if (ch === '(') {
      if (cur.trim() !== '') { console.log('Before (: push', JSON.stringify(cur.trim().substring(0, 30))); rows.push(cur.trim()); }
      cur = '';
    }
    else if (ch === ')' && cur.trim()) { 
      console.log('At ): push', JSON.stringify(cur.trim().substring(0, 30)));
      rows.push(cur.trim()); 
      cur = ''; 
    }
    else cur += ch;
  }
}

console.log('Total raw rows:', rows.length);
console.log('First 3 raw:');
for (let i = 0; i < Math.min(3, rows.length); i++) {
  console.log(`  ${i}: ${JSON.stringify(rows[i].substring(0, 50))}`);
}
