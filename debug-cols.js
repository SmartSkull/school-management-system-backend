const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function getCols(tableName) {
  const regex = new RegExp('CREATE TABLE `' + tableName + '` \\\\([\\s\\S]*?)\\) ENGINE=');
  const match = sql.match(regex);
  console.log('Match for', tableName, ':', match ? 'FOUND' : 'NOT FOUND');
  if (!match) return [];
  const cols = [];
  const cr = /`([^`]+)`\s+([^,\n]+)/g;
  let m;
  while ((m = cr.exec(match[1])) !== null) {
    cols.push(m[1]);
  }
  return cols;
}

console.log('Staff cols:', getCols('staff').join(', '));
console.log('Admin cols:', getCols('admin').join(', '));
console.log('Users cols:', getCols('users').join(', '));
