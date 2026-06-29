const fs = require('fs');

console.log('=== DEDUPLICATING ATTENDANCE DATA ===\n');

const attendData = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8'));

// Find duplicates (same student, session, term)
const keyCounts = new Map();
for (const r of attendData) {
  const key = `${r.studentId}_${r.session}_${r.term}`;
  keyCounts.set(key, (keyCounts.get(key) || 0) + 1);
}

const duplicates = [...keyCounts.entries()].filter(([_, c]) => c > 1);
console.log(`Duplicate keys found: ${duplicates.length}`);
console.log('Sample duplicates:', duplicates.slice(0, 5).map(d => d[0]).join(', '));

// Remove duplicates (keep first occurrence)
const seen = new Set();
const deduped = [];
for (const r of attendData) {
  const key = `${r.studentId}_${r.session}_${r.term}`;
  if (!seen.has(key)) {
    seen.add(key);
    deduped.push(r);
  }
}

console.log(`\nOriginal: ${attendData.length}`);
console.log(`After dedup: ${deduped.length}`);
console.log(`Removed: ${attendData.length - deduped.length} duplicates`);

fs.writeFileSync('clean-attendance-deduped.json', JSON.stringify(deduped, null, 2));
console.log('\nWrote clean-attendance-deduped.json');