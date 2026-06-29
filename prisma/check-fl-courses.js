const fs = require('fs');

const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');
const flLines = flSql.split('\n').filter(l => 
  l.trim().startsWith('(') && l.includes("'fpis/") && 
  l.includes("'2025/2026'") && l.includes("'second'")
);

// Get unique courses
const courses = new Map();
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

  const course = parts[3]?.replace(/^'|'$/g, '');
  if (course) courses.set(course.toLowerCase(), (courses.get(course.toLowerCase()) || 0) + 1);
}

console.log('Florieren 2025/2026 second term courses:');
[...courses.entries()].sort((a,b) => b[1]-a[1]).slice(0, 20).forEach(([c, n]) => 
  console.log(`  "${c}": ${n}`)
);