const fs = require('fs');

console.log('=== FIXED ATTENDANCE EXTRACTION ===\n');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');

function parseAttendance(sql) {
  const records = [];
  let inAttendanceBlock = false;
  
  for (const line of sql.split('\n')) {
    if (line.includes('INSERT INTO `attendance`')) {
      inAttendanceBlock = true;
      continue;
    }
    if (inAttendanceBlock && line.trim().startsWith('(')) {
      const clean = line.trim().replace(/^\(/, '').replace(/\),\s*$/, '');
      const parts = [];
      let current = '';
      let inQuote = false;
      
      for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        if (char === "'") inQuote = !inQuote;
        else if (char === ',' && !inQuote) {
          parts.push(current.trim().replace(/^'|'$/g, ''));
          current = '';
        } else {
          current += char;
        }
      }
      if (current) parts.push(current.trim().replace(/^'|'$/g, ''));

      const studentId = parts[1] || '';
      
      if (studentId.startsWith('greatkings/')) {
        records.push({
          studentId, present: parts[2] || '0', absent: parts[3] || '0',
          comment: parts[4] || '', principal: parts[5] || '',
          term: parts[6] || '', session: parts[7] || ''
        });
      } else if (studentId.startsWith('fpis/')) {
        records.push({
          studentId, present: parts[2] || '0', absent: parts[3] || '0',
          comment: parts[4] || '', principal: parts[5] || '',
          term: parts[7] || '', session: parts[8] || ''
        });
      }
    }
    if (line.includes(');')) inAttendanceBlock = false;
  }
  return records;
}

const gkRecords = parseAttendance(gkSql);
const flRecords = parseAttendance(flSql);

console.log(`GKA records: ${gkRecords.length}`);
console.log(`Florieren records: ${flRecords.length}`);

// Filter to valid format (YYYY/YYYY session)
const cleanGk = gkRecords.filter(r => r.session && r.session.includes('/') && r.term);
const cleanFl = flRecords.filter(r => r.session && r.session.includes('/') && r.term);

console.log(`Valid GKA records: ${cleanGk.length}`);
console.log(`Valid Florieren records: ${cleanFl.length}`);

// Show session distribution
const gkSessions = new Map();
for (const r of cleanGk) {
  gkSessions.set(r.session, (gkSessions.get(r.session) || 0) + 1);
}
console.log('\nGKA session distribution:');
[...gkSessions.entries()].forEach(([s, c]) => console.log(`  ${s}: ${c}`));

// Write clean data
fs.writeFileSync('clean-attendance.json', JSON.stringify([...cleanGk, ...cleanFl], null, 2));
console.log('\nWrote clean-attendance.json');

// Unique students
const allRecords = [...cleanGk, ...cleanFl];
const uniqueStudents = new Set(allRecords.map(r => r.studentId));
console.log(`Unique students with valid attendance: ${uniqueStudents.size}`);