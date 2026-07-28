/**
 * audit-gka.js
 * 1. Extracts every unique student_id from the `result` table in greatkin_gk.sql
 * 2. Compares against Railway User.uniqueId records for GKA
 * 3. Identifies students in users table but missing from Railway
 * 4. Reports full picture
 */

const fs    = require('fs');
const mysql = require('mysql2/promise');

const DB_URL      = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const SQL_FILE    = './greatkin_gk.sql';
const GKA_SCHOOL_ID = 9;

// Parse all lines matching result-table student_id pattern
function extractResultStudentIds(content) {
  // Result table columns: id, student_id, course, session, term, ...
  // Pattern: each INSERT row starts with (number, 'greatkings/...',
  const ids = new Set();
  const lines = content.split('\n');
  let inResult = false;

  for (const line of lines) {
    if (/INSERT INTO `result`/i.test(line)) { inResult = true; continue; }
    if (inResult && /^CREATE TABLE|^INSERT INTO `(?!result)/i.test(line)) { inResult = false; continue; }
    if (inResult) {
      // Each row: (id, 'student_id', 'course', ...)
      const m = line.match(/^\s*\(\d+,\s*'(greatkings\/[^']+)'/);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

function extractUsersTable(content) {
  // Parse users table rows
  const students = [];
  const lines = content.split('\n');
  let inUsers = false;
  let cols = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/INSERT INTO `users`/i.test(trimmed)) {
      inUsers = true;
      // Extract columns
      const m = trimmed.match(/INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES/i);
      if (m) cols = m[1].split(',').map(c => c.trim().replace(/`/g,''));
      continue;
    }
    if (inUsers && /^CREATE TABLE/i.test(trimmed)) { inUsers = false; continue; }
    if (inUsers && cols && trimmed.startsWith('(')) {
      // Quick extract: student_id is at position 1 (index 1)
      const m = trimmed.match(/^\(\d+,\s*'(greatkings\/[^']+)'/);
      if (m) students.push(m[1]);
    }
  }
  return students;
}

async function main() {
  console.log('Reading SQL file...');
  const content = fs.readFileSync(SQL_FILE, 'utf8');

  console.log('Extracting result table student IDs...');
  const resultIds = extractResultStudentIds(content);
  console.log(`  Unique student IDs in result table: ${resultIds.size}`);

  console.log('Extracting users table student IDs...');
  const userIds = extractUsersTable(content);
  const userIdSet = new Set(userIds);
  console.log(`  Student IDs in users table: ${userIdSet.size}`);

  // Students with results but no users table entry (orphaned results)
  const inResultNotInUsers = [...resultIds].filter(id => !userIdSet.has(id));
  console.log(`  In result but NOT in users table: ${inResultNotInUsers.length}`);

  console.log('\nConnecting to Railway...');
  const conn = await mysql.createConnection(DB_URL);

  const [railwayUsers] = await conn.execute(
    'SELECT uniqueId FROM User WHERE schoolId = ? AND role = ?', [GKA_SCHOOL_ID, 'STUDENT']
  );
  const railwayIds = new Set(railwayUsers.map(r => r.uniqueId));
  console.log(`Railway GKA students: ${railwayIds.size}`);

  // Missing from Railway
  const missingFromRailway = [...userIdSet].filter(id => !railwayIds.has(id));
  const missingFromRailwayWithResults = [...resultIds].filter(id => !railwayIds.has(id));

  console.log(`\n── Audit Summary ──`);
  console.log(`  SQL users table student count  : ${userIdSet.size}`);
  console.log(`  SQL result table unique IDs    : ${resultIds.size}`);
  console.log(`  Railway student count          : ${railwayIds.size}`);
  console.log(`  In SQL users, missing Railway  : ${missingFromRailway.length}`);
  console.log(`  In SQL results, missing Railway: ${missingFromRailwayWithResults.length}`);

  if (missingFromRailway.length > 0) {
    console.log(`\n  Missing students (in users table):`);
    missingFromRailway.slice(0, 20).forEach(id => console.log(`    - ${id}`));
    if (missingFromRailway.length > 20) console.log(`    ... and ${missingFromRailway.length - 20} more`);
  }

  if (missingFromRailwayWithResults.length > 0) {
    console.log(`\n  Sample IDs with results but missing from Railway:`);
    missingFromRailwayWithResults.slice(0, 10).forEach(id => console.log(`    - ${id}`));
  }

  // Also check staff
  const [railwayStaff] = await conn.execute(
    'SELECT uniqueId, role, firstName, lastName FROM User WHERE schoolId = ? AND role IN (?,?)',
    [GKA_SCHOOL_ID, 'STAFF', 'ADMIN']
  );
  console.log(`\n── Staff in Railway ──`);
  railwayStaff.forEach(s => console.log(`  ${s.role}: ${s.firstName} ${s.lastName} (${s.uniqueId})`));

  await conn.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
