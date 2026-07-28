/**
 * migrate-missing-gka-v3.js
 * 
 * 1. Extracts ALL greatkings student IDs from result table (col index 2)
 * 2. Extracts student records from users table
 * 3. Finds students with results but missing from Railway
 * 4. Inserts missing students (from users table data if available, or minimal record)
 * 5. Also syncs missing staff
 */

const fs    = require('fs');
const mysql = require('mysql2/promise');

const DB_URL        = 'mysql://root:HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ@yamabiko.proxy.rlwy.net:29012/florieren';
const SQL_FILE      = './greatkin_gk.sql';
const GKA_SCHOOL_ID = 9;

// ── Parsers ──────────────────────────────────────────────────────────────────

function extractResultStudentIds(lines) {
  // result cols: id, staff_id, student_id, class_id, course, session, term, ...
  // student_id is at index 2 (third field)
  const ids = new Set();
  let inResult = false;

  for (const line of lines) {
    if (/INSERT INTO `result`/i.test(line)) { inResult = true; continue; }
    if (inResult && /^CREATE TABLE/i.test(line.trim())) { inResult = false; continue; }
    if (inResult) {
      // Match: (number, 'staff/...', 'greatkings/...',
      const m = line.match(/^\s*\(\d+,\s*'[^']*',\s*'(greatkings\/[^']+)'/);
      if (m) ids.add(m[1]);
    }
  }
  return ids;
}

function extractUsersRows(lines) {
  // users cols: user_id, student_id, firstname, lastname, father_name, mother_name,
  //             image, parent_image, email, telephone, class, gender, date_of_birth,
  //             state_of_origin, home_address, about, year_of_admission, password, ...
  const students = new Map(); // student_id -> row object
  let inUsers = false;
  let cols = null;

  for (const line of lines) {
    const t = line.trim();
    if (/INSERT INTO `users`/i.test(t)) {
      inUsers = true;
      const m = t.match(/INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES/i);
      if (m) cols = m[1].split(',').map(c => c.trim().replace(/`/g,''));
      continue;
    }
    if (inUsers && /^CREATE TABLE/i.test(t)) { inUsers = false; cols = null; continue; }
    if (inUsers && cols && t.startsWith('(')) {
      // Quick parse: grab the known fields by regex for speed
      const m = t.match(/^\(\d+,\s*'(greatkings\/[^']+)',\s*'([^']*)',\s*'([^']*)',/);
      if (m) {
        const studentId = m[1];
        if (!students.has(studentId)) {
          // Full parse for this row
          const row = parseRow(t, cols);
          if (row) students.set(studentId, row);
        }
      }
    }
  }
  return students;
}

function parseRow(line, cols) {
  const t = line.trim().replace(/[,;]$/, '').trim();
  if (!t.startsWith('(') || !t.endsWith(')')) return null;
  const inner = t.slice(1, -1);
  const vals = [];
  let cur = '', inStr = false, esc = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (esc) { cur += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; cur += ch; continue; }
    if (ch === "'" && !inStr) { inStr = true; cur += ch; continue; }
    if (ch === "'" && inStr) { inStr = false; cur += ch; continue; }
    if (ch === ',' && !inStr) { vals.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) vals.push(cur.trim());
  if (vals.length !== cols.length) return null;
  const row = {};
  cols.forEach((c, i) => {
    let v = vals[i];
    if (v === 'NULL') v = null;
    else if (v && v.startsWith("'") && v.endsWith("'")) v = v.slice(1,-1).replace(/\\'/g,"'").replace(/\\\\/g,'\\');
    row[c] = v;
  });
  return row;
}

function extractStaffRows(lines) {
  const staff = new Map();
  let inStaff = false;
  let cols = null;

  for (const line of lines) {
    const t = line.trim();
    if (/INSERT INTO `staff`/i.test(t)) {
      inStaff = true;
      const m = t.match(/INSERT INTO `staff`\s*\(([^)]+)\)\s*VALUES/i);
      if (m) cols = m[1].split(',').map(c => c.trim().replace(/`/g,''));
      continue;
    }
    if (inStaff && /^CREATE TABLE/i.test(t)) { inStaff = false; cols = null; continue; }
    if (inStaff && cols && t.startsWith('(')) {
      const row = parseRow(t, cols);
      if (row && row.unique_id) {
        const key = row.unique_id.startsWith('staff/') ? row.unique_id
          : `gka-${row.unique_id}-${row.staff_id}`;
        const prev = staff.get(key);
        if (!prev || parseInt(row.staff_id) > parseInt(prev.staff_id)) {
          staff.set(key, { ...row, _key: key });
        }
      }
    }
  }
  return staff;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Reading SQL file...');
  const lines = fs.readFileSync(SQL_FILE, 'utf8').split('\n');
  console.log(`  Total lines: ${lines.length}`);

  console.log('Extracting result table student IDs (col index 2)...');
  const resultIds = extractResultStudentIds(lines);
  console.log(`  Unique student IDs in result table: ${resultIds.size}`);

  console.log('Extracting users table rows...');
  const usersMap = extractUsersRows(lines);
  console.log(`  Student rows in users table: ${usersMap.size}`);

  console.log('Extracting staff rows...');
  const staffMap = extractStaffRows(lines);
  console.log(`  Unique staff entries: ${staffMap.size}`);

  // Merge: all unique IDs we need in Railway
  const allNeededIds = new Set([...resultIds, ...usersMap.keys()]);
  console.log(`  Total unique student IDs needed: ${allNeededIds.size}`);

  console.log('\nConnecting to Railway...');
  const conn = await mysql.createConnection(DB_URL);

  // Get existing Railway users
  const [existingRows] = await conn.execute(
    'SELECT uniqueId FROM User WHERE schoolId = ?', [GKA_SCHOOL_ID]
  );
  const existingIds = new Set(existingRows.map(r => r.uniqueId));
  console.log(`Railway GKA users: ${existingIds.size}`);

  // Get/build classMap
  const [existingClasses] = await conn.execute(
    'SELECT id, name FROM ClassRoom WHERE schoolId = ?', [GKA_SCHOOL_ID]
  );
  const classMap = new Map(existingClasses.map(r => [r.name.trim().toUpperCase(), r.id]));

  // Collect all class names needed
  const classNames = new Set();
  for (const row of usersMap.values()) {
    if (row.class && row.class.trim()) classNames.add(row.class.trim().toUpperCase());
  }
  // Ensure classes exist
  let classesAdded = 0;
  for (const name of classNames) {
    if (!classMap.has(name)) {
      const [res] = await conn.execute(
        'INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?,?,NOW(),NOW())',
        [GKA_SCHOOL_ID, name]
      );
      classMap.set(name, res.insertId);
      classesAdded++;
    }
  }
  if (classesAdded) console.log(`Added ${classesAdded} new ClassRooms`);

  // ── Insert missing students ──────────────────────────────────────────────
  console.log('\n── Inserting missing students ──');
  const missing = [...allNeededIds].filter(id => !existingIds.has(id));
  console.log(`Students to insert: ${missing.length}`);

  let added = 0, errors = 0;

  for (const uniqueId of missing) {
    const s = usersMap.get(uniqueId);

    // Derive name: from users table if available, else split the ID hash
    const firstName = s ? (s.firstname || '').trim() : 'Unknown';
    const lastName  = s ? (s.lastname  || '').trim() : uniqueId.split('/').pop();
    const classKey  = s && s.class ? s.class.trim().toUpperCase() : null;
    const classRoomId = classKey ? (classMap.get(classKey) || null) : null;
    const password  = s ? (s.password || '$2y$10$defaultpassword') : '$2y$10$defaultpassword';
    const dob = s && s.date_of_birth && s.date_of_birth !== '0000-00-00' && s.date_of_birth.trim()
      ? new Date(s.date_of_birth) : null;

    try {
      const [userRes] = await conn.execute(
        `INSERT INTO User (schoolId, role, uniqueId, firstName, lastName, email, telephone, image, password, status, createdAt, updatedAt)
         VALUES (?, 'STUDENT', ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
        [
          GKA_SCHOOL_ID, uniqueId, firstName, lastName,
          s ? s.email || null : null,
          s ? s.telephone || null : null,
          (s && s.image && s.image !== 'image.png') ? s.image : null,
          password,
        ]
      );

      await conn.execute(
        `INSERT INTO Student (userId, studentNo, classRoomId, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, admissionYear, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [
          userRes.insertId, uniqueId, classRoomId, dob,
          s ? s.state_of_origin || null : null,
          s ? s.home_address || null : null,
          s ? s.father_name || null : null,
          s ? s.mother_name || null : null,
          s ? s.year_of_admission || null : null,
        ]
      );

      existingIds.add(uniqueId);
      added++;
      if (added % 100 === 0) console.log(`  ... ${added} inserted`);
    } catch (err) {
      errors++;
      if (errors <= 10) console.error(`  ERR ${uniqueId}: ${err.message}`);
    }
  }
  console.log(`  Done — Added: ${added} | Errors: ${errors}`);

  // ── Insert missing staff ─────────────────────────────────────────────────
  console.log('\n── Inserting missing staff ──');
  let sAdded = 0, sErrors = 0;

  for (const [, s] of staffMap) {
    const uniqueId = s._key;
    if (!uniqueId || existingIds.has(uniqueId)) continue;

    const firstName = (s.firstname || '').trim();
    const lastName  = (s.lastname  || '').trim();
    if (!firstName && !lastName) continue;

    const isAdmin = s.user === 'admin';
    const role    = isAdmin ? 'ADMIN' : 'STAFF';
    const password = s.password || '$2y$10$defaultpassword';
    const dob = s.date_of_birth && s.date_of_birth !== '0000-00-00' && s.date_of_birth.trim()
      ? new Date(s.date_of_birth) : null;

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
          [userRes.insertId, uniqueId, s.state_of_origin||null, dob, s.home_address||null, s.about||null]
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
  console.log(`  Staff Done — Added: ${sAdded} | Errors: ${sErrors}`);

  // ── Final summary ────────────────────────────────────────────────────────
  console.log('\n── Final Railway Counts ──');
  const [[{cnt: fS}]] = await conn.execute('SELECT COUNT(*) cnt FROM User WHERE schoolId=? AND role=?',[GKA_SCHOOL_ID,'STUDENT']);
  const [[{cnt: fSt}]] = await conn.execute('SELECT COUNT(*) cnt FROM User WHERE schoolId=? AND role=?',[GKA_SCHOOL_ID,'STAFF']);
  const [[{cnt: fA}]] = await conn.execute('SELECT COUNT(*) cnt FROM User WHERE schoolId=? AND role=?',[GKA_SCHOOL_ID,'ADMIN']);
  const [[{cnt: fR}]] = await conn.execute('SELECT COUNT(*) cnt FROM User WHERE schoolId=?',[GKA_SCHOOL_ID]);
  console.log(`  Students : ${fS}  (SQL result refs: ${resultIds.size}, SQL user rows: ${usersMap.size})`);
  console.log(`  Staff    : ${fSt}`);
  console.log(`  Admin    : ${fA}`);
  console.log(`  Total    : ${fR}`);

  await conn.end();
  console.log('\nDone ✓');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
