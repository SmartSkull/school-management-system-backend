const fs = require('fs');

console.log('=== MIGRATION SQL FILES SUMMARY ===\n');

const userFile = fs.readFileSync('migration-users-and-students.sql', 'utf8');
const attFile = fs.readFileSync('migration-attendance.sql', 'utf8');

console.log(`migration-users-and-students.sql: ${userFile.length} bytes, ${userFile.split('\n').length} lines`);
console.log(`migration-attendance.sql: ${attFile.length} bytes, ${attFile.split('\n').length} lines`);

console.log('\n=== HOW TO RUN MIGRATION ===');
console.log('1. First run migration-users-and-students.sql to create missing users and student records');
console.log('2. Then run migration-attendance.sql to insert attendance records');

console.log('\n=== EXPECTED RESULTS ===');
console.log('Users: 388 + 215 = 603');
console.log('Students: 315 + 215 = 530');
console.log('Attendance: 546 + ~1875 = ~2421 records');

console.log('\n=== FILES TO CHECK ===');
console.log('- attendance-final.sql (original generated attendance)');
console.log('- clean-attendance.json (parsed attendance data)');
console.log('- gka-users.json, florieren-users.json (user data)');