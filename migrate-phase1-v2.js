const mysql = require('mysql2/promise');
const fs = require('fs');

const DB_CONFIG = {
  host: 'yamabiko.proxy.rlwy.net',
  port: 29012,
  user: 'root',
  password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ',
  database: 'florieren'
};
const SCHOOL_ID = 9;
const SKIP_UNIQUE_IDS = new Set(['admin/2022/3a18', 'admin', 'admin1']);

function unquote(v) {
  if (v === null || v === undefined) return null;
  v = String(v).trim();
  if (v.toLowerCase() === 'null') return null;
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  return v;
}

function parseSqlRows(tableName) {
  const regex = new RegExp('INSERT INTO `' + tableName + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const content = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
  const match = content.match(regex);
  if (!match) return { cols: [], rows: [] };
  const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const valuesBlock = match[2].trim();
  if (!valuesBlock) return { cols, rows: [] };
  const rows = [];
  let cur = '', inStr = false, sc = '';
  for (let i = 0; i < valuesBlock.length; i++) {
    const ch = valuesBlock[i];
    if (inStr) {
      if (ch === sc && valuesBlock[i-1] !== '\\') inStr = false;
      cur += ch;
    } else {
      if (ch === "'" || ch === '"') { inStr = true; sc = ch; cur += ch; }
      else if (ch === '(') { cur = ''; }
      else if (ch === ')' && cur.trim()) { rows.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
  }
  const parsedRows = [];
  for (const rowStr of rows) {
    const vals = [];
    let rCur = '', rInStr = false, rSc = '';
    for (let i = 0; i < rowStr.length; i++) {
      const ch = rowStr[i];
      if (rInStr) {
        if (ch === rSc && rowStr[i-1] !== '\\') rInStr = false;
        rCur += ch;
      } else {
        if (ch === "'" || ch === '"') { rInStr = true; rSc = ch; rCur += ch; }
        else if (ch === ',') { vals.push(unquote(rCur)); rCur = ''; }
        else rCur += ch;
      }
    }
    const last = unquote(rCur);
    if (last !== null && last !== undefined && String(last).trim() !== '') vals.push(last);
    if (vals.length > 0) parsedRows.push(vals);
  }
  return { cols, rows: parsedRows };
}

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  await conn.beginTransaction();
  
  try {
    const userMap = {};
    const classMap = {};
    const subjectMap = {};
    
    console.log('=== Load existing Sessions & Terms ===');
    const [sessions] = await conn.execute('SELECT id, name FROM AcademicSession');
    const sessionMap = {};
    for (const s of sessions) sessionMap[s.name] = s.id;
    const [terms] = await conn.execute('SELECT id, sessionId, name FROM AcademicTerm');
    const termMap = {};
    for (const t of terms) {
      const sName = Object.keys(sessionMap).find(k => sessionMap[k] === t.sessionId);
      if (sName) termMap[sName + '_' + t.name.toLowerCase()] = t.id;
    }
    console.log('Sessions:', sessions.length, 'Terms:', terms.length);
    
    console.log('\n=== ClassRooms ===');
    const { cols: classCols, rows: classRows } = parseSqlRows('class');
    console.log('Source:', classRows.length);
    for (const row of classRows) {
      const className = unquote(row[classCols.indexOf('class')]);
      if (!className) continue;
      const [existing] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? AND schoolId = ?', [className, SCHOOL_ID]);
      if (existing.length > 0) { classMap[className] = existing[0].id; continue; }
      const [res] = await conn.execute('INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())', [SCHOOL_ID, className]);
      classMap[className] = res.insertId;
      console.log('Class:', className, 'id:', res.insertId);
    }
    
    console.log('\n=== Subjects ===');
    const { cols: courseCols, rows: courseRows } = parseSqlRows('course');
    console.log('Source:', courseRows.length);
    for (const row of courseRows) {
      const courseName = unquote(row[courseCols.indexOf('courses')]);
      if (!courseName) continue;
      const [found] = await conn.execute('SELECT id FROM Subject WHERE name = ? LIMIT 1', [courseName]);
      if (found.length > 0) { subjectMap[courseName] = found[0].id; continue; }
      const [res] = await conn.execute('INSERT INTO Subject (name, createdAt, updatedAt) VALUES (?, NOW(), NOW())', [courseName]);
      subjectMap[courseName] = res.insertId;
      console.log('Subject:', courseName, 'id:', res.insertId);
    }
    
    console.log('\n=== Users - Admin ===');
    const { cols: adminCols, rows: adminRows } = parseSqlRows('admin');
    console.log('Source:', adminRows.length);
    for (const row of adminRows) {
      const uniqueId = unquote(row[adminCols.indexOf('unique_id')]);
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) { console.log('Skipping admin:', uniqueId); continue; }
      const [exists] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [uniqueId]);
      if (exists.length > 0) { userMap[uniqueId] = exists[0].id; continue; }
      const firstName = unquote(row[adminCols.indexOf('other_names')]) || 'Admin';
      const lastName = unquote(row[adminCols.indexOf('surname')]) || '';
      const email = unquote(row[adminCols.indexOf('email')]);
      const telephone = unquote(row[adminCols.indexOf('telephone')]);
      const password = unquote(row[adminCols.indexOf('password')]) || '$2y$10$default';
      const image = unquote(row[adminCols.indexOf('image')]);
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [uniqueId, 'ADMIN', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      userMap[uniqueId] = res.insertId;
      console.log('Admin:', uniqueId, 'id:', res.insertId);
    }
    
    console.log('\n=== Users - Staff ===');
    const { cols: staffCols, rows: staffRows } = parseSqlRows('staff');
    console.log('Source:', staffRows.length);
    for (const row of staffRows) {
      const uniqueId = unquote(row[staffCols.indexOf('unique_id')]);
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) { console.log('Skipping staff:', uniqueId); continue; }
      const [exists] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [uniqueId]);
      if (exists.length > 0) { userMap[uniqueId] = exists[0].id; continue; }
      const firstName = unquote(row[staffCols.indexOf('firstname')]) || 'Staff';
      const lastName = unquote(row[staffCols.indexOf('lastname')]) || '';
      const email = unquote(row[staffCols.indexOf('email')]);
      const telephone = unquote(row[staffCols.indexOf('telephone')]);
      const password = unquote(row[staffCols.indexOf('password')]) || '$2y$10$default';
      const image = unquote(row[staffCols.indexOf('image')]);
      const stateOfOrigin = unquote(row[staffCols.indexOf('state_of_origin')]);
      const dateOfBirth = unquote(row[staffCols.indexOf('date_of_birth')]);
      const homeAddress = unquote(row[staffCols.indexOf('home_address')]);
      const about = unquote(row[staffCols.indexOf('about')]);
      
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [uniqueId, 'STAFF', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      const userId = res.insertId;
      userMap[uniqueId] = userId;
      await conn.execute(
        'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, uniqueId, stateOfOrigin, dateOfBirth || null, homeAddress, about]
      );
      if (res.insertId % 15 === 0) console.log('  ... staff:', res.insertId);
    }
    console.log('Staff done');
    
    console.log('\n=== Users - Students ===');
    const { cols: usersCols, rows: usersRows } = parseSqlRows('users');
    console.log('Source:', usersRows.length);
    for (const row of usersRows) {
      const studentId = unquote(row[usersCols.indexOf('student_id')]);
      if (!studentId || SKIP_UNIQUE_IDS.has(studentId)) continue;
      const [exists] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [studentId]);
      if (exists.length > 0) { userMap[studentId] = exists[0].id; continue; }
      const firstName = unquote(row[usersCols.indexOf('firstname')]) || 'Student';
      const lastName = unquote(row[usersCols.indexOf('lastname')]) || '';
      const email = unquote(row[usersCols.indexOf('email')]);
      const telephone = unquote(row[usersCols.indexOf('telephone')]);
      const password = unquote(row[usersCols.indexOf('password')]) || '$2y$10$default';
      const image = unquote(row[usersCols.indexOf('image')]);
      const dateOfBirth = unquote(row[usersCols.indexOf('date_of_birth')]);
      const stateOfOrigin = unquote(row[usersCols.indexOf('state_of_origin')]);
      const homeAddress = unquote(row[usersCols.indexOf('home_address')]);
      const about = unquote(row[usersCols.indexOf('about')]);
      const admissionYear = unquote(row[usersCols.indexOf('year_of_admission')]);
      const fatherName = unquote(row[usersCols.indexOf('father_name')]);
      const motherName = unquote(row[usersCols.indexOf('mother_name')]);
      const parentImage = unquote(row[usersCols.indexOf('parent_image')]);
      
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [studentId, 'STUDENT', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      const userId = res.insertId;
      userMap[studentId] = userId;
      
      const className = unquote(row[usersCols.indexOf('class')]);
      let classRoomId = null;
      if (className && classMap[className]) classRoomId = classMap[className];
      else if (className) {
        const [cls] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? LIMIT 1', [className]);
        if (cls.length > 0) classRoomId = cls[0].id;
      }
      
      await conn.execute(
        'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, studentId, classRoomId, admissionYear, dateOfBirth || null, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about]
      );
      if (res.insertId % 20 === 0) console.log('  ... students:', res.insertId);
    }
    console.log('Students done');
    
    await conn.commit();
    console.log('\n=== Phase 1 COMMITTED ===');
    console.log('Total users mapped:', Object.keys(userMap).length);
    
  } catch (e) {
    await conn.rollback();
    console.error('Phase 1 ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
  
  await conn.end();
}

run().catch(e => console.error(e));
