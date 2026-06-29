const fs = require('fs');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');

// Get unique course names from 2025/2026 second term
const gkLines = gkSql.split('\n').filter(l => 
  l.trim().startsWith('(') && l.includes("'2025/2026'") && l.includes("'second'")
);

const gkCourses = new Map();
for (const line of gkLines) {
  const parts = [];
  let current = '';
  let inQuote = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "'") inQuote = !inQuote;
    else if (char === ',' && !inQuote) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current.trim());

  if (parts.length > 3) {
    const course = parts[3]?.replace(/^'|'$/g, '');
    if (course) gkCourses.set(course, (gkCourses.get(course) || 0) + 1);
  }
}

console.log('GKA 2025/2026 second term courses:');
[...gkCourses.entries()].sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([c, n]) => console.log(`  "${c}": ${n}`));

const flLines = flSql.split('\n').filter(l => 
  l.trim().startsWith('(') && l.includes("'2025/2026'") && l.includes("'second'")
);

const flCourses = new Map();
for (const line of flLines) {
  const parts = [];
  let current = '';
  let inQuote = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === "'") inQuote = !inQuote;
    else if (char === ',' && !inQuote) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current) parts.push(current.trim());

  if (parts.length > 3) {
    const course = parts[3]?.replace(/^'|'$/g, '');
    if (course) flCourses.set(course, (flCourses.get(course) || 0) + 1);
  }
}

console.log('\nFlorieren 2025/2026 second term courses:');
[...flCourses.entries()].sort((a,b) => b[1]-a[1]).slice(0, 15).forEach(([c, n]) => console.log(`  "${c}": ${n}`));