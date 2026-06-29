const fs = require('fs');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');

// GKA columns: user_id, student_id, firstname, lastname, father_name, mother_name, image, parent_image, email, telephone, class, gender, ...
const lines = gkSql.split('\n').filter(l => l.trim().startsWith('(') && l.includes("'greatkings/"));

const classes = new Map();
for (const line of lines) {
  // Parse properly
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

  // class is at index 10
  if (parts.length > 10) {
    const studentId = parts[1] || '';
    const classField = parts[10] || ''; // This is the class field
    
    if (studentId && studentId.includes('greatkings/')) {
      const cleaned = classField || '(empty)';
      classes.set(cleaned, (classes.get(cleaned) || 0) + 1);
    }
  }
}

console.log('GKA class field distribution (FIXED):');
const sorted = [...classes.entries()].sort((a,b) => b[1]-a[1]);
sorted.slice(0, 20).forEach(([c, n]) => console.log(`  "${c}": ${n}`));

// Valid class patterns
const validPatterns = ['JSS', 'JS', 'SS', 'Primary', 'Nursery', 'Pre', 'Kg', 'Kg-'];
const validClasses = [...classes.keys()].filter(c => validPatterns.some(p => c.includes(p)));
console.log('\nValid class values:', validClasses.join(', '));