/**
 * fix-missing-classes.js
 * 
 * 1. Finds all GKA students in Railway with no classRoomId
 * 2. Looks up their class in the SQL file (users table)
 * 3. Matches to the correct GKA ClassRoom and assigns it
 */

const fs    = require('fs');
const mysql = require('mysql2/promise');

const DB_URL        = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const SQL_FILE      = './greatkin_gk.sql';
const GKA_SCHOOL_ID = 9;

// Robust parser — same apostrophe-safe approach as fix-broken-names.js
function extractUsersFromSql(content) {
  const lines = content.split('\n');
  const students = new Map(); // uniqueId -> { class, ... }
  let inUsers = false, cols = null, rowBuffer = '';

  for (const line of lines) {
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

    rowBuffer += (rowBuffer ? ' ' : '') + trimmed;

    if (/\)[,;]?\s*$/.test(trimmed) && rowBuffer.trim().startsWith('(')) {
      const vals = parseRow(rowBuffer.trim());
      rowBuffer = '';
      if (!vals || vals.length < 4) continue;
      const row = {};
      cols.forEach((c, i) => { row[c] = (vals[i] === 'NULL' || vals[i] === undefined) ? null : vals[i].trim(); });
      const uid = row['student_id'];
      if (uid && uid.startsWith('greatkings/')) {
        students.set(uid, { class: row['class'] || null });
      }
    }
  }
  return students;
}

function parseRow(raw) {
  const line = raw.trim().replace(/[,;]$/, '').trim();
  if (!line.startsWith('(') || !line.endsWith(')')) return null;
  const inner = line.slice(1, -1);
  const vals = [];
  let cur = '', inStr = false, i = 0;
  while (i < inner.length) {
    const ch = inner[i];
    if (inStr && ch === '\\' && i + 1 < inner.length) {
      const next = inner[i + 1];
      cur += (next === "'" ? "'" : next === '\\' ? '\\' : next);
      i += 2; continue;
    }
    if (ch === "'" && !inStr) { inStr = true; i++; continue; }
    if (ch === "'" && inStr)  { inStr = false; i++; continue; }
    if (ch === ',' && !inStr) { vals.push(cur); cur = ''; i++; continue; }
    cur += ch; i++;
  }
  vals.push(cur);
  return vals;
}

async function main() {
  console.log('Parsing SQL for class assignments...');
  const content  = fs.readFileSync(SQL_FILE, 'utf8');
  const sqlMap   = extractUsersFromSql(content);
  console.log(`  Parsed ${sqlMap.size} GKA student records from SQL`);

  console.log('\nConnecting to Railway...');
  const conn = await mysql.createConnection(DB_URL);

  // Get all GKA students with no classRoomId
  const [noClass] = await conn.execute(`
    SELECT u.id AS userId, u.uniqueId, u.firstName, u.lastName, s.id AS studentId
    FROM User u
    JOIN Student s ON s.userId = u.id
    WHERE u.schoolId = ? AND u.role = 'STUDENT' AND s.classRoomId IS NULL
  `, [GKA_SCHOOL_ID]);
  console.log(`GKA students with no class: ${noClass.length}`);

  if (noClass.length === 0) { console.log('Nothing to fix!'); await conn.end(); return; }

  // Get all GKA classrooms
  const [classes] = await conn.execute(
    'SELECT id, name FROM ClassRoom WHERE schoolId = ?', [GKA_SCHOOL_ID]
  );
  // Build lookup: uppercase name -> id
  const classMap = new Map(classes.map(c => [c.name.trim().toUpperCase(), c.id]));
  console.log(`GKA ClassRooms available: ${classMap.size}`);
  classes.forEach(c => console.log(`  "${c.name}"`));

  let fixed = 0, noSqlData = 0, noClassInSql = 0, noClassMatch = 0;

  console.log('\nFixing...');
  for (const student of noClass) {
    const sqlData = sqlMap.get(student.uniqueId);

    if (!sqlData) {
      // Student not in SQL (registered live) — can't determine class from SQL
      noSqlData++;
      console.log(`  [NO SQL DATA] ${student.uniqueId} "${student.firstName} ${student.lastName}"`);
      continue;
    }

    const rawClass = sqlData.class;
    if (!rawClass || !rawClass.trim()) {
      noClassInSql++;
      console.log(`  [BLANK IN SQL] ${student.uniqueId} "${student.firstName} ${student.lastName}"`);
      continue;
    }

    const classKey   = rawClass.trim().toUpperCase();
    const classRoomId = classMap.get(classKey);

    if (!classRoomId) {
      // Class name exists in SQL but no matching ClassRoom in GKA — create it
      console.log(`  [NEW CLASS] "${rawClass}" not in GKA — creating...`);
      const [res] = await conn.execute(
        'INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?,?,NOW(),NOW())',
        [GKA_SCHOOL_ID, rawClass.trim()]
      );
      classMap.set(classKey, res.insertId);
      console.log(`    Created ClassRoom "${rawClass}" id=${res.insertId}`);
    }

    const finalClassId = classMap.get(classKey);
    await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [finalClassId, student.studentId]);
    fixed++;
    console.log(`  ✓ ${student.uniqueId} "${student.firstName} ${student.lastName}" → "${rawClass}"`);
  }

  console.log(`\n── Summary ──`);
  console.log(`  Fixed              : ${fixed}`);
  console.log(`  No SQL data (live) : ${noSqlData}`);
  console.log(`  Blank in SQL       : ${noClassInSql}`);
  console.log(`  No class match     : ${noClassMatch}`);

  // Final count
  const [[{ cnt }]] = await conn.execute(`
    SELECT COUNT(*) cnt FROM User u
    JOIN Student s ON s.userId = u.id
    WHERE u.schoolId = ? AND u.role = 'STUDENT' AND s.classRoomId IS NULL
  `, [GKA_SCHOOL_ID]);
  console.log(`\nGKA students still without class: ${cnt}`);

  await conn.end();
  console.log('Done ✓');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
