const fs = require('fs');

console.log('=== EXTRACTING ALL MISSING USERS AND CLASS DATA ===\n');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');

function extractUsers(sql, schoolId) {
  const users = [];
  const blocks = sql.match(/INSERT INTO `users`[^;]+\);/gs);
  if (!blocks) return users;

  for (const block of blocks) {
    const lines = block.split('\n').filter(l => l.trim().startsWith('('));
    
    for (const line of lines) {
      const parts = [];
      let current = '';
      let inQuote = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === "'") inQuote = !inQuote;
        else if (char === ',' && !inQuote) {
          parts.push(current.trim().replace(/^'|'$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      if (current) parts.push(current.trim().replace(/^'|'$/g, ''));

      // GKA users columns: user_id, student_id, firstname, lastname, father_name, mother_name, image, parent_image, email, telephone, class, ...
      // FL users columns: user_id, student_id, firstname, middlename, lastname, father_name, mother_name, image, parent_image, email, telephone, class, ...
      
      const studentId = parts[1];
      if (!studentId || !studentId.includes('/')) continue;
      
      users.push({
        userId: parts[0],
        studentId,
        firstname: parts[2] || '',
        middlename: parts[3] || '',
        lastname: parts[4] || '',
        fatherName: parts[5] || '',
        motherName: parts[6] || '',
        image: parts[7] || 'image.png',
        parentImage: parts[8] || 'image.png',
        email: parts[9] || '',
        telephone: parts[10] || '',
        className: parts[11] || '', // e.g., 'SS2A', 'Nursery-1', 'Primary-1'
        schoolId
      });
    }
  }
  return users;
}

const gkUsers = extractUsers(gkSql, 9);
const flUsers = extractUsers(flSql, 8);

console.log(`GKA users extracted: ${gkUsers.length}`);
console.log(`Florieren users extracted: ${flUsers.length}`);

// Show class distribution
const gkClasses = new Map();
gkUsers.forEach(u => {
  if (u.className) {
    gkClasses.set(u.className, (gkClasses.get(u.className) || 0) + 1);
  }
});
console.log('\nGKA class distribution:');
[...gkClasses.entries()].forEach(([c, n]) => console.log(`  ${c}: ${n}`));

const flClasses = new Map();
flUsers.forEach(u => {
  if (u.className) {
    flClasses.set(u.className, (flClasses.get(u.className) || 0) + 1);
  }
});
console.log('\nFlorieren class distribution:');
[...flClasses.entries()].forEach(([c, n]) => console.log(`  ${c}: ${n}`));

fs.writeFileSync('gka-users.json', JSON.stringify(gkUsers, null, 2));
fs.writeFileSync('florieren-users.json', JSON.stringify(flUsers, null, 2));
console.log('\nWrote user files');

// Check missing users
const allUsers = [...gkUsers, ...flUsers];
const allStudents = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8')).map(r => r.studentId);
const uniqueStudents = [...new Set(allStudents)];

const missingFromAttendance = allUsers.filter(u => !uniqueStudents.includes(u.studentId));
console.log(`\nUsers not in attendance data: ${missingFromAttendance.length}`);