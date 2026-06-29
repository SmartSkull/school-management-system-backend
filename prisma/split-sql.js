const fs = require('fs');
const lines = fs.readFileSync('attendance-insert.sql', 'utf8').split('\n');
const values = lines.slice(1); // Skip header line

// Split into chunks of 100
const chunks = [];
for (let i = 0; i < values.length; i += 100) {
  chunks.push(values.slice(i, i + 100));
}

console.log(`Total values: ${values.length}`);
console.log(`Chunks to create: ${chunks.length}`);

for (let i = 0; i < chunks.length; i++) {
  const sql = `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES\n${chunks[i].join('\n')};\n`;
  fs.writeFileSync(`attendance-chunk-${i}.sql`, sql);
}

console.log('Created chunk files');

// Show first chunk
console.log('\nFirst chunk sample:');
console.log(chunks[0].slice(0, 3).join('\n'));