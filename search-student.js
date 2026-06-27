const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
const idx = sql.indexOf('student/2022/3483');
if (idx >= 0) {
  const start = Math.max(0, idx - 200);
  const end = Math.min(sql.length, idx + 200);
  console.log('Context:');
  console.log(sql.substring(start, end));
} else {
  console.log('NOT FOUND');
}
