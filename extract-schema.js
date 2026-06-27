const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
const lines = sql.split('\n');

const tables = {};
let currentTable = null;

for (const line of lines) {
  const createMatch = line.match(/CREATE TABLE `([^`]+)`/i);
  if (createMatch) {
    currentTable = createMatch[1];
    tables[currentTable] = [];
  }
  
  if (currentTable) {
    const colMatch = line.match(/^\s*`([^`]+)`\s+([^,\s]+)/);
    if (colMatch && colMatch[1] !== 'ENGINE' && colMatch[1] !== 'DEFAULT' && colMatch[1] !== 'COLLATE' && colMatch[1] !== 'CHARSET') {
      tables[currentTable].push({ name: colMatch[1], type: colMatch[2] });
    }
  }
}

for (const [name, cols] of Object.entries(tables)) {
  console.log(`\n=== ${name} ===`);
  for (const c of cols) {
    console.log(`  ${c.name}: ${c.type}`);
  }
}
