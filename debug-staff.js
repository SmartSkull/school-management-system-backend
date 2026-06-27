const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

// Count occurrences of INSERT INTO `staff`
const matches = sql.match(/INSERT INTO `staff`/g);
console.log('INSERT INTO `staff` occurrences:', matches ? matches.length : 0);

// Find the position
const idx = sql.indexOf('INSERT INTO `staff`');
if (idx >= 0) {
  const sample = sql.substring(idx, idx + 1000);
  console.log('Sample:');
  console.log(sample);
}

// Count rows in the staff INSERT block
const headerIdx = sql.indexOf('INSERT INTO `staff`');
const blockEnd = sql.indexOf(';', headerIdx);
const block = sql.substring(headerIdx, blockEnd);
const rowCount = (block.match(/\(/g) || []).length;
console.log('Row count in staff block:', rowCount);
