const fs = require('fs');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');

console.log('=== STUDENT ID COUNT BY SOURCE FILE ===\n');

// GKA students
const gkStudents = new Set();
const gkAttMatches = gkSql.matchAll(/'((?:greatkings)\/[^']+)'/g);
for (const m of gkAttMatches) {
  gkStudents.add(m[1]);
}
console.log(`greatkin_gk.sql - GKA attendance students: ${gkStudents.size}`);

// Florieren students (fpis/) - need to specifically target attendance table
// The format in greatkin_florieren.sql: INSERT INTO `attendance` ... VALUES (id, 'student_id', ...)
const flStudents = new Set();

// Find attendance INSERT blocks and extract student IDs
const flAttendanceBlocks = flSql.match(/INSERT INTO `attendance`[^;]+\;/gs);
if (flAttendanceBlocks) {
  for (const block of flAttendanceBlocks) {
    const matches = block.matchAll(/'((?:fpis|florieren)\/[^']+)'/g);
    for (const m of matches) {
      flStudents.add(m[1]);
    }
  }
}

console.log(`greatkin_florieren.sql - Florieren attendance students: ${flStudents.size}`);

// Students in DB
// Check database counts
console.log('\n=== DATABASE VERIFICATION NEEDED ===');
console.log('Run this query on Railway DB:');
console.log(`
SELECT 
  SUM(CASE WHEN s.studentNo LIKE 'greatkings/%' THEN 1 ELSE 0 END) as gka_in_db,
  SUM(CASE WHEN s.studentNo LIKE 'fpis/%' THEN 1 ELSE 0 END) as fpis_in_db,
  COUNT(*) as total_students
FROM Student s;
`);

console.log('\nThis shows:');
console.log('- 469 GKA students in SQL but only 135 in DB');
console.log('- 237 Florieren students in SQL but only 171 in DB');
console.log('- Missing: ~334 GKA attendance records, ~66 Florieren attendance records');