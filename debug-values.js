const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function findValuesBlock(table) {
  const pat = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const m = sql.match(pat);
  if (!m) return null;
  return m[2].trim();
}

const vb = findValuesBlock('assignment');
if (vb) {
  console.log('First 500 chars:');
  console.log(vb.substring(0, 500));
  console.log('\n...');
  console.log('Last 500 chars:');
  console.log(vb.substring(vb.length - 500));
}
