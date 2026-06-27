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

function parseSqlRows(tableName) {
  const regex = new RegExp('INSERT INTO `' + tableName + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const match = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8').match(regex);
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
        else if (ch === ',') { vals.push(rCur.trim()); rCur = ''; }
        else rCur += ch;
      }
    }
    if (rCur.trim()) vals.push(rCur.trim());
    if (vals.length > 0) parsedRows.push(vals);
  }
  return { cols, rows: parsedRows };
}

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
  
  const userMap = {};
  const classMap = {};
  const subjectMap = {};
  
  await conn.beginTransaction();
  
  try {
    console.log('=== Step 1: Sessions & Terms (existing) ===');
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
    
    console.log('\n=== Step 2: ClassRooms ===');
    const { cols: classCols, rows: classRows } = parseSqlRows('class');
    console.log('Source classes:', classRows.length);
    for (const row of classRows) {
      const className = row[classCols.indexOf('class')];
      if (!className) continue;
      const [existing] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? AND schoolId = ?', [className, SCHOOL_ID]);
      if (existing.length > 0) { classMap[className] = existing[0].id; continue; }
      const [res] = await conn.execute('INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())', [SCHOOL_ID, className]);
      classMap[className] = res.insertId;
      console.log('Class:', className, 'id:', res.insertId);
    }
    
    console.log('\n=== Step 3: Subjects ===');
    const { cols: courseCols, rows: courseRows } = parseSqlRows('course');
    console.log('Source courses:', courseRows.length);
    for (const row of courseRows) {
      const courseName = row[courseCols.indexOf('courses')];
      if (!courseName) continue;
      const [found] = await conn.execute('SELECT id FROM Subject WHERE name = ? LIMIT 1', [courseName]);
      if (found.length > 0) { subjectMap[courseName] = found[0].id; continue; }
      const [res] = await conn.execute('INSERT INTO Subject (name, createdAt, updatedAt) VALUES (?, NOW(), NOW())', [courseName]);
      subjectMap[courseName] = res.insertId;
      console.log('Subject:', courseName, 'id:', res.insertId);
    }
    
    console.log('\n=== Step 4: Users - Admin ===');
    const { cols: adminCols, rows: adminRows } = parseSqlRows('admin');
    console.log('Source admin rows:', adminRows.length);
    for (const row of adminRows) {
      const uniqueId = row[adminCols.indexOf('unique_id')];
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) { console.log('Skipping admin:', uniqueId); continue; }
      const [exists] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [uniqueId]);
      if (exists.length > 0) { userMap[uniqueId] = exists[0].id; continue; }
      const firstName = row[adminCols.indexOf('other_names')] || 'Admin';
      const lastName = row[adminCols.indexOf('surname')] || '';
      const email = row[adminCols.indexOf('email')] || null;
      const telephone = row[adminCols.indexOf('telephone')] || null;
      const password = row[adminCols.indexOf('password')] || '$2y$10$default';
      const image = row[adminCols.indexOf('image')] || null;
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [uniqueId, 'ADMIN', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      userMap[uniqueId] = res.insertId;
      console.log('Created admin:', uniqueId, 'id:', res.insertId);
    }
    
    console.log('\n=== Step 5: Users - Staff ===');
    const { cols: staffCols, rows: staffRows } = parseSqlRows('staff');
    console.log('Source staff rows:', staffRows.length);
    for (const row of staffRows) {
      const uniqueId = row[staffCols.indexOf('unique_id')];
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) { console.log('Skipping staff:', uniqueId); continue; }
      const [exists] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [uniqueId]);
      if (exists.length > 0) { userMap[uniqueId] = exists[0].id; continue; }
      const firstName = row[staffCols.indexOf('firstname')] || 'Staff';
      const lastName = row[staffCols.indexOf('lastname')] || '';
      const email = row[staffCols.indexOf('email')] || null;
      const telephone = row[staffCols.indexOf('telephone')] || null;
      const password = row[staffCols.indexOf('password')] || '$2y$10$default';
      const image = row[staffCols.indexOf('image')] || null;
      const stateOfOrigin = row[staffCols.indexOf('state_of_origin')] || null;
      const dateOfBirth = row[staffCols.indexOf('date_of_birth')] || null;
      const homeAddress = row[staffCols.indexOf('home_address')] || null;
      const about = row[staffCols.indexOf('about')] || null;
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [uniqueId, 'STAFF', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      const userId = res.insertId;
      userMap[uniqueId] = userId;
      const [staffRes] = await conn.execute(
        'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, uniqueId, stateOfOrigin, dateOfBirth || null, homeAddress, about]
      );
      if (staffRes.insertId % 10 === 0) console.log('  ... imported', staffRes.insertId, 'staff');
    }
    console.log('Staff imported');
    
    console.log('\n=== Step 6: Users - Students ===');
    const { cols: usersCols, rows: usersRows } = parseSqlRows('users');
    console.log('Source users rows:', usersRows.length);
    for (const row of usersRows) {
      const studentId = row[usersCols.indexOf('student_id')];
      if (!studentId || SKIP_UNIQUE_IDS.has(studentId)) continue;
      const [exists] = await conn.execute('SELECT id FROM User WHERE uniqueId = ?', [studentId]);
      if (exists.length > 0) { userMap[studentId] = exists[0].id; continue; }
      const firstName = row[usersCols.indexOf('firstname')] || 'Student';
      const lastName = row[usersCols.indexOf('lastname')] || '';
      const email = row[usersCols.indexOf('email')] || null;
      const telephone = row[usersCols.indexOf('telephone')] || null;
      const password = row[usersCols.indexOf('password')] || '$2y$10$default';
      const image = row[usersCols.indexOf('image')] || null;
      const dateOfBirth = row[usersCols.indexOf('date_of_birth')] || null;
      const stateOfOrigin = row[usersCols.indexOf('state_of_origin')] || null;
      const homeAddress = row[usersCols.indexOf('home_address')] || null;
      const about = row[usersCols.indexOf('about')] || null;
      const admissionYear = row[usersCols.indexOf('year_of_admission')] || null;
      const fatherName = row[usersCols.indexOf('father_name')] || null;
      const motherName = row[usersCols.indexOf('mother_name')] || null;
      const parentImage = row[usersCols.indexOf('parent_image')] || null;
      
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [studentId, 'STUDENT', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      const userId = res.insertId;
      userMap[studentId] = userId;
      
      const className = row[usersCols.indexOf('class')];
      let classRoomId = null;
      if (className && classMap[className]) classRoomId = classMap[className];
      else if (className) {
        const [cls] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? LIMIT 1', [className]);
        if (cls.length > 0) classRoomId = cls[0].id;
      }
      
      const [studRes] = await conn.execute(
        'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, studentId, classRoomId, admissionYear, dateOfBirth || null, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about]
      );
      if (studRes.insertId % 20 === 0) console.log('  ... imported', studRes.insertId, 'students');
    }
    console.log('Students imported');
    
    await conn.commit();
    console.log('\n=== Phase 1 committed ===');
    console.log('Total users mapped:', Object.keys(userMap).length);
    
  } catch (e) {
    await conn.rollback();
    console.error('Phase 1 error:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
  
  await conn.end();
}

run().catch(e => console.error(e));
