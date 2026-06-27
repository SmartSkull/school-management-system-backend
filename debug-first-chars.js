const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

const m = sql.match(/INSERT INTO `assignment`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]*?);(?=\s*--|\s*INSERT|\s*CREATE|\s*$)/i);
if (m) {
  const vb = m[2].trim();
  console.log('First 50 chars:', JSON.stringify(vb.substring(0, 50)));
  console.log('First 10 char codes:');
  for (let i = 0; i < Math.min(50, vb.length); i++) {
    console.log(`  ${i}: '${vb[i]}' (${vb.charCodeAt(i)})`);
  }
}
