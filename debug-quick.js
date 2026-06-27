const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

const m = sql.match(/INSERT INTO `assignment`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i);
console.log('Match:', m ? 'YES' : 'NO');
if (m) {
  const vb = m[2].trim();
  console.log('VB length:', vb.length);
  console.log('First 200:', vb.substring(0, 200));
  console.log('Has semicolons:', vb.includes(';'));
}
