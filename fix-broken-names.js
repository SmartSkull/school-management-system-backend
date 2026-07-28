/**
 * fix-broken-names.js
 * 
 * The SQL parser broke on escaped apostrophes (AL\'AMEEN, O\'BRIEN etc).
 * This script:
 * 1. Re-parses ALL users rows from the SQL using a robust apostrophe-aware parser
 * 2. Compares firstName/lastName against what's in Railway
 * 3. Updates any that don't match
 */

const fs    = require('fs');
const mysql = require('mysql2/promise');

const DB_URL        = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const SQL_FILE      = './greatkin_gk.sql';
const GKA_SCHOOL_ID = 9;

// Robust single-row parser that correctly handles \' inside strings
function parseRow(raw) {
  // Strip leading/trailing parens and trailing comma/semicolon
  const line = raw.trim().replace(/[,;]$/, '').trim();
  if (!line.startsWith('(') || !line.endsWith(')')) return null;
  const inner = line.slice(1, -1);

  const vals = [];
  let cur = '';
  let inStr = false;
  let i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    // Handle MySQL escape sequences inside strings
    if (inStr && ch === '\\' && i + 1 < inner.length) {
      const next = inner[i + 1];
      if (next === "'") { cur += "'"; i += 2; continue; }
      if (next === '\\') { cur += '\\'; i += 2; continue; }
      if (next === 'n')  { cur += '\n'; i += 2; continue; }
      if (next === 'r')  { cur += '\r'; i += 2; continue; }
      // other escapes: just keep the char
      cur += next; i += 2; continue;
    }
    if (ch === "'" && !inStr) { inStr = true; i++; continue; }
    if (ch === "'" && inStr)  { inStr = false; i++; continue; }
    if (ch === ',' && !inStr) { vals.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  vals.push(cur);
  return vals;
}

function extractUsersFromSql(content) {
  const lines = content.split('\n');
  const students = new Map(); // uniqueId -> { firstName, lastName, email, telephone, class, image, password, ... }

  let inUsers = false;
  let cols = null;
  // Buffer for multi-line rows (in case a row spans lines — unlikely but safe)
  let rowBuffer = '';

  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const trimmed = line.trimEnd();

    if (/INSERT INTO `users`/i.test(trimmed)) {
      inUsers = true;
      const m = trimmed.match(/INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES/i);
      if (m) cols = m[1].split(',').map(c => c.trim().replace(/`/g, ''));
      rowBuffer = '';
      continue;
    }

    if (inUsers && /^(CREATE TABLE|--\s+Table structure)/i.test(trimmed)) {
      inUsers = false; cols = null; rowBuffer = ''; continue;
    }

    if (!inUsers || !cols) continue;

    // Accumulate into rowBuffer until we see a line ending with ), or );
    rowBuffer += (rowBuffer ? ' ' : '') + trimmed;

    // A complete row ends with ), or );
    if (/\)[,;]?\s*$/.test(trimmed) && rowBuffer.trim().startsWith('(')) {
      const vals = parseRow(rowBuffer.trim());
      rowBuffer = '';

      if (!vals || vals.length < 4) continue;

      // Build row object
      const row = {};
      cols.forEach((c, i) => {
        const v = vals[i];
        row[c] = (v === 'NULL' || v === undefined) ? null : v.trim();
      });

      const uid = row['student_id'];
      if (uid && uid.startsWith('greatkings/')) {
        students.set(uid, {
          firstName : (row['firstname'] || '').trim(),
          lastName  : (row['lastname']  || '').trim(),
          email     : row['email'] || null,
          telephone : row['telephone'] || null,
          image     : row['image'] && row['image'] !== 'image.png' ? row['image'] : null,
          password  : row['password'] || null,
          class     : row['class'] || null,
        });
      }
    }
  }
  return students;
}

async function main() {
  console.log('Parsing SQL file with robust apostrophe-aware parser...');
  const content = fs.readFileSync(SQL_FILE, 'utf8');
  const sqlStudents = extractUsersFromSql(content);
  console.log(`  Parsed ${sqlStudents.size} GKA student records from SQL`);

  // Show any names with apostrophes found
  const apostropheNames = [...sqlStudents.entries()].filter(([, s]) =>
    s.firstName.includes("'") || s.lastName.includes("'")
  );
  if (apostropheNames.length) {
    console.log(`  Names containing apostrophes (${apostropheNames.length}):`);
    apostropheNames.forEach(([uid, s]) => console.log(`    ${uid}: "${s.firstName} ${s.lastName}"`));
  }

  console.log('\nConnecting to Railway...');
  const conn = await mysql.createConnection(DB_URL);

  // Fetch all GKA students from Railway
  const [railwayStudents] = await conn.execute(
    "SELECT id, uniqueId, firstName, lastName FROM User WHERE schoolId = ? AND role = 'STUDENT'",
    [GKA_SCHOOL_ID]
  );
  const railwayMap = new Map(railwayStudents.map(r => [r.uniqueId, r]));
  console.log(`  Railway has ${railwayMap.size} GKA students`);

  // Compare and fix
  let fixed = 0;
  let mismatches = [];

  for (const [uid, sqlData] of sqlStudents) {
    const rwRow = railwayMap.get(uid);
    if (!rwRow) continue; // not in railway — skip (separate issue)

    const sqlFirst = sqlData.firstName;
    const sqlLast  = sqlData.lastName;
    const rwFirst  = rwRow.firstName;
    const rwLast   = rwRow.lastName;

    const firstMismatch = sqlFirst && sqlFirst !== rwFirst;
    const lastMismatch  = sqlLast  && sqlLast  !== rwLast;

    if (firstMismatch || lastMismatch) {
      mismatches.push({ uid, sqlFirst, sqlLast, rwFirst, rwLast });
    }
  }

  console.log(`\nName mismatches found: ${mismatches.length}`);
  if (mismatches.length > 0) {
    console.log('\nFixing...');
    for (const m of mismatches) {
      console.log(`  ${m.uid}`);
      console.log(`    Railway: "${m.rwFirst} ${m.rwLast}"`);
      console.log(`    SQL    : "${m.sqlFirst} ${m.sqlLast}"`);
      await conn.execute(
        "UPDATE User SET firstName = ?, lastName = ? WHERE uniqueId = ?",
        [m.sqlFirst, m.sqlLast, m.uid]
      );
      fixed++;
      console.log(`    ✓ Fixed`);
    }
  }

  console.log(`\nTotal fixed: ${fixed}`);
  await conn.end();
  console.log('Done ✓');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
