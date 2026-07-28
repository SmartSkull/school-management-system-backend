/**
 * migrate-missing-gka.js  (v2 — line-by-line parser)
 * Reads greatkin_gk.sql line by line, collects all student/staff rows,
 * then inserts any that are missing from Railway.
 * Safe to run multiple times — skips records that already exist.
 */

const fs   = require('fs');
const mysql = require('mysql2/promise');

const DB_URL      = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const SQL_FILE    = './greatkin_gk.sql';
const GKA_SCHOOL_ID = 9;

// ── SQL value-row parser ─────────────────────────────────────────────────────
// Parses a single VALUES row like: (1, 'foo', NULL, 'bar')
function parseValueRow(line) {
  line = line.trim().replace(/[,;]$/, '').trim();
  if (!line.startsWith('(') || !line.endsWith(')')) return null;
  const inner = line.slice(1, -1);
  const vals = [];
  let cur = '';
  let inStr = false;
  let escape = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (escape) { cur += ch; escape = false; continue; }
    if (ch === '\\') { escape = true; cur += ch; continue; }
    if (ch === "'" && !inStr) { inStr = true; cur += ch; continue; }
    if (ch === "'" && inStr) { inStr = false; cur += ch; continue; }
    if (ch === ',' && !inStr) { vals.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim() !== '' || inner.endsWith(',')) vals.push(cur.trim());
  return vals.map(v => {
    if (v.toUpperCase() === 'NULL') return null;
    if (v.startsWith("'") && v.endsWith("'")) {
      return v.slice(1, -1).replace(/\\'/g, "'").replace(/\\\\/g, '\\');
    }
    return isNaN(v) ? v : v; // keep as string; convert later if needed
  });
}

function parseCols(line) {
  // Extract column names from: INSERT INTO `table` (`col1`, `col2`, ...) VALUES
  const m = line.match(/INSERT INTO `[^`]+`\s*\(([^)]+)\)\s*VALUES/i);
  if (!m) return null;
  return m[1].split(',').map(c => c.trim().replace(/`/g, ''));
}

// ── Parse SQL file ────────────────────────────────────────────────────────────
function parseSqlFile(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  const tables = {};  // tableName -> [rowObjects]

  let currentTable = null;
  let currentCols  = null;

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (/^INSERT INTO `/i.test(line)) {
      const tMatch = line.match(/INSERT INTO `([^`]+)`/i);
      if (!tMatch) continue;
      currentTable = tMatch[1];
      currentCols  = parseCols(line);
      if (!tables[currentTable]) tables[currentTable] = [];
      continue;
    }

    // Data row
    if (currentTable && currentCols && /^\s*\(/.test(line)) {
      const trimmed = line.trim();
      // Skip if it's a sub-query or schema statement that happens to start with (
      if (/^(SELECT|INSERT|UPDATE|CREATE|DROP|ALTER)/i.test(trimmed.slice(1))) continue;

      const vals = parseValueRow(trimmed);
      if (vals && vals.length === currentCols.length) {
        const row = {};
        currentCols.forEach((c, i) => { row[c] = vals[i]; });
        tables[currentTable].push(row);
      }
      // Reset on semicolon-terminated row
      if (trimmed.endsWith(';')) { currentTable = null; currentCols = null; }
      continue;
    }

    // Blank line or comment resets context
    if (!line.trim() || line.trim().startsWith('--')) {
      if (currentTable && !/VALUES/i.test(line)) {
        // only reset if we're past the INSERT header
      }
    }
  }

  return tables;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading and parsing SQL file (this may take a moment)...');
  const tables = parseSqlFile(SQL_FILE);

  const sqlStudents = tables['users'] || [];
  const sqlStaff    = tables['staff'] || [];
  const sqlClasses  = tables['class'] || [];

  console.log(`Parsed from SQL:`);
  console.log(`  users (students): ${sqlStudents.length}`);
  console.log(`  staff           : ${sqlStaff.length}`);
  console.log(`  class           : ${sqlClasses.length}`);

  // Validate student count
  const gkaStudents = sqlStudents.filter(s => s.student_id && String(s.student_id).startsWith('greatkings/'));
  console.log(`  GKA students (greatkings/* IDs): ${gkaStudents.length}`);

  console.log('\nConnecting to Railway...');
  const conn = await mysql.createConnection(DB_URL);

  // ── Existing data ──────────────────────────────────────────────────────────
  const [existingUsers] = await conn.execute(
    'SELECT uniqueId FROM User WHERE schoolId = ?', [GKA_SCHOOL_ID]
  );
  const existingIds = new Set(existingUsers.map(r => r.uniqueId));
  console.log(`Railway GKA users already present: ${existingIds.size}`);

  const [existingClasses] = await conn.execute(
    'SELECT id, name FROM ClassRoom WHERE schoolId = ?', [GKA_SCHOOL_ID]
  );
  const classMap = new Map(existingClasses.map(r => [r.name.trim().toUpperCase(), r.id]));
  console.log(`Railway GKA ClassRooms: ${classMap.size}`);

  // ── Ensure ClassRooms exist ────────────────────────────────────────────────
  console.log('\n── Syncing ClassRooms ──');
  const allClassNames = new Set();
  for (const s of gkaStudents) {
    if (s.class && s.class.trim()) allClassNames.add(s.class.trim().toUpperCase());
  }
  for (const s of sqlStaff) {
    if (s.class && s.class.trim()) allClassNames.add(s.class.trim().toUpperCase());
  }
  for (const c of sqlClasses) {
    const cn = (c.class || '').trim();
    if (cn) allClassNames.add(cn.toUpperCase());
  }

  let classesAdded = 0;
  for (const name of allClassNames) {
    if (!classMap.has(name)) {
      const [res] = await conn.execute(
        'INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())',
        [GKA_SCHOOL_ID, name]
      );
      classMap.set(name, res.insertId);
      classesAdded++;
      console.log(`  + ClassRoom: ${name}`);
    }
  }
  console.log(`  Added ${classesAdded} new ClassRooms`);

  // ── Insert missing students ────────────────────────────────────────────────
  console.log('\n── Syncing Students ──');
  let added = 0, skipped = 0, errors = 0;

  for (const s of gkaStudents) {
    const uniqueId = (s.student_id || '').trim();
    if (!uniqueId) { skipped++; continue; }
    if (existingIds.has(uniqueId)) { skipped++; continue; }

    const firstName = (s.firstname || '').trim();
    const lastName  = (s.lastname  || '').trim();
    if (!firstName && !lastName) { skipped++; continue; }

    const classKey  = s.class ? s.class.trim().toUpperCase() : null;
    const classRoomId = classKey ? (classMap.get(classKey) || null) : null;
    const password  = s.password || '$2y$10$defaultpassword';
    const dob       = (s.date_of_birth && s.date_of_birth !== '0000-00-00' && s.date_of_birth !== '') ? new Date(s.date_of_birth) : null;

    try {
      const [userRes] = await conn.execute(
        `INSERT INTO User (schoolId, role, uniqueId, firstName, lastName, email, telephone, image, password, status, createdAt, updatedAt)
         VALUES (?, 'STUDENT', ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
        [
          GKA_SCHOOL_ID, uniqueId, firstName, lastName,
          s.email || null, s.telephone || null,
          (s.image && s.image !== 'image.png') ? s.image : null,
          password,
        ]
      );

      await conn.execute(
        `INSERT INTO Student (userId, studentNo, classRoomId, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, admissionYear, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userRes.insertId, uniqueId, classRoomId,
          dob, s.state_of_origin || null, s.home_address || null,
          s.father_name || null, s.mother_name || null,
          s.year_of_admission || null,
        ]
      );

      existingIds.add(uniqueId);
      added++;
      if (added % 200 === 0) console.log(`  ... ${added} students inserted so far`);
    } catch (err) {
      errors++;
      if (errors <= 10) console.error(`  ERR student ${uniqueId}: ${err.message}`);
    }
  }
  console.log(`  Students — Added: ${added} | Skipped: ${skipped} | Errors: ${errors}`);

  // ── Insert missing staff ───────────────────────────────────────────────────
  console.log('\n── Syncing Staff ──');

  // Deduplicate staff: for staff/* IDs keep latest; for admin/* use synthetic key
  const staffMap = new Map();
  for (const s of sqlStaff) {
    const uid = (s.unique_id || '').trim();
    const isSystemAdmin = ['admin', 'admin1', 'admin2', 'leo'].includes(uid);
    const key = isSystemAdmin ? `gka-${uid}-${s.staff_id}` : uid;
    if (!key) continue;
    const prev = staffMap.get(key);
    if (!prev || parseInt(s.staff_id) > parseInt(prev._staff_id)) {
      staffMap.set(key, { ...s, _key: key, _staff_id: s.staff_id });
    }
  }

  let sAdded = 0, sSkipped = 0, sErrors = 0;
  for (const [, s] of staffMap) {
    const uniqueId = s._key;
    if (!uniqueId) { sSkipped++; continue; }
    if (existingIds.has(uniqueId)) { sSkipped++; continue; }

    const firstName = (s.firstname || '').trim();
    const lastName  = (s.lastname  || '').trim();
    if (!firstName && !lastName) { sSkipped++; continue; }

    const isAdmin = s.user === 'admin';
    const role    = isAdmin ? 'ADMIN' : 'STAFF';
    const password = s.password || '$2y$10$defaultpassword';
    const dob = (s.date_of_birth && s.date_of_birth !== '0000-00-00' && s.date_of_birth !== '') ? new Date(s.date_of_birth) : null;

    try {
      const [userRes] = await conn.execute(
        `INSERT INTO User (schoolId, role, uniqueId, firstName, lastName, email, telephone, image, password, status, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
        [
          GKA_SCHOOL_ID, role, uniqueId, firstName, lastName,
          s.email || null, s.telephone || null,
          (s.image && s.image !== 'image.png') ? s.image : null,
          password,
        ]
      );

      if (role === 'STAFF') {
        await conn.execute(
          `INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
          [userRes.insertId, uniqueId, s.state_of_origin || null, dob, s.home_address || null, s.about || null]
        );
      }

      existingIds.add(uniqueId);
      sAdded++;
      console.log(`  + ${role}: ${firstName} ${lastName} (${uniqueId})`);
    } catch (err) {
      sErrors++;
      console.error(`  ERR staff ${uniqueId}: ${err.message}`);
    }
  }
  console.log(`  Staff — Added: ${sAdded} | Skipped: ${sSkipped} | Errors: ${sErrors}`);

  // ── Final summary ──────────────────────────────────────────────────────────
  console.log('\n── Final Counts in Railway ──');
  const [[{ cnt: fStudents }]] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM User WHERE schoolId = ? AND role = ?', [GKA_SCHOOL_ID, 'STUDENT']
  );
  const [[{ cnt: fStaff }]] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM User WHERE schoolId = ? AND role = ?', [GKA_SCHOOL_ID, 'STAFF']
  );
  const [[{ cnt: fAdmin }]] = await conn.execute(
    'SELECT COUNT(*) as cnt FROM User WHERE schoolId = ? AND role = ?', [GKA_SCHOOL_ID, 'ADMIN']
  );
  console.log(`  Students : ${fStudents}  (SQL source had ${gkaStudents.length})`);
  console.log(`  Staff    : ${fStaff}`);
  console.log(`  Admin    : ${fAdmin}`);

  await conn.end();
  console.log('\nDone ✓');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
