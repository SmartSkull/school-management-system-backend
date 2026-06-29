const fs = require('fs');

const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');

// Find results for 2025/2026, second term
const gkSecond = (gkSql.match(/'2025\/2026', 'second'/g) || []).length;
const flSecond = (flSql.match(/'2025\/2026', 'second'/g) || []).length;

const gkSecond2 = (gkSql.match(/'second', '2025\/2026'/g) || []).length;
const flSecond2 = (flSql.match(/'second', '2025\/2026'/g) || []).length;

console.log('Results for 2025/2026 second term:');
console.log(`GKA patterns (session,term): ${gkSecond}`);
console.log(`Florieren patterns (session,term): ${flSecond}`);
console.log(`GKA patterns (term,session): ${gkSecond2}`);
console.log(`Florieren patterns (term,session): ${flSecond2}`);

// Actually count result rows
const gkResultLines = gkSql.split('\n').filter(l => 
  l.trim().startsWith('(') && l.includes("'2025/2026'") && l.includes("'second'")
);
console.log(`\nGKA result lines with 2025/2026 and second: ${gkResultLines.length}`);

const flResultLines = flSql.split('\n').filter(l => 
  l.trim().startsWith('(') && l.includes("'2025/2026'") && l.includes("'second'")
);
console.log(`Florieren result lines with 2025/2026 and second: ${flResultLines.length}`);