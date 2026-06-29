const fs = require('fs');

console.log('=== SIMPLE ATTENDANCE EXTRACTION ===\n');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');

// Find lines that look like data rows
const lines = gkSql.split('\n');
const dataLines = lines.filter(l => l.trim().startsWith('(') && l.includes("'greatkings/"));

console.log(`Found ${dataLines.length} greatkings data lines`);

// Simple parsing - split on commas but handle quoted values
function parseLine(line) {
  // Remove leading ( and trailing ), split
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
  
  return parts;
}

const records = [];
for (const line of dataLines) {
  const parts = parseLine(line);
  if (parts.length >= 8 && parts[1].startsWith('greatkings')) {
    records.push({
      id: parts[0],
      studentId: parts[1],
      present: parts[2] || '0',
      absent: parts[3] || '0',
      comment: parts[4] || '',
      principal: parts[5] || '',
      term: parts[6] || '',
      session: parts[7] || ''
    });
  }
}

console.log(`Parsed ${records.length} records`);

if (records.length > 0) {
  console.log('\nSample:');
  records.slice(0, 10).forEach(r => 
    console.log(`  ${r.studentId}: present=${r.present}, absent=${r.absent}, term=${r.term}, session=${r.session}`)
  );
}

// Write to file
fs.writeFileSync('attendance-data.json', JSON.stringify(records, null, 2));
console.log('\nWrote to attendance-data.json');