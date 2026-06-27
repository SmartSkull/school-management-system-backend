const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function countRows(tableName) {
  const regex = new RegExp('INSERT INTO `' + tableName + '`.*?VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const match = sql.match(regex);
  if (!match) return 0;
  return (match[1].match(/^\(/gm) || []).length;
}

// Count all tables
const tableRegex = /CREATE TABLE `([^`]+)`/g;
let m;
const tables = [];
while ((m = tableRegex.exec(sql)) !== null) {
  tables.push(m[1]);
}

console.log('Table row counts:');
for (const t of tables) {
  const c = countRows(t);
  if (c > 0) console.log(`  ${t}: ${c}`);
}
