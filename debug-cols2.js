const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function getCols(tableName) {
  const startMarker = 'CREATE TABLE `' + tableName + '`';
  const idx = sql.indexOf(startMarker);
  if (idx === -1) return [];
  const endIdx = sql.indexOf(') ENGINE=', idx);
  if (endIdx === -1) return [];
  const def = sql.substring(idx, endIdx + 1);
  const cols = [];
  const cr = /`([^`]+)`\s+([^,\n]+)/g;
  let m;
  while ((m = cr.exec(def)) !== null) {
    cols.push(m[1]);
  }
  return cols;
}

console.log('Staff cols:', getCols('staff').join(', '));
console.log('Admin cols:', getCols('admin').join(', '));
console.log('Users cols:', getCols('users').join(', '));
console.log('Result cols:', getCols('result').join(', '));
