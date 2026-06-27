const mysql = require('mysql2/promise');
const fs = require('fs');

const DB_CONFIG = {
  host: 'yamabiko.proxy.rlwy.net', port: 29012,
  user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
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
    if (last !== null && String(last).trim() !== '') vals.push(last);
    if (vals.length > 0) parsedRows.push(vals);
  }
  return { cols, rows: parsedRows };
}

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  await conn.beginTransaction();
  
  try {
    console.log('Loading existing data...');
    const [sessions] = await conn.execute('SELECT id, name FROM AcademicSession');
    const sessionMap = {};
    for (const s of sessions) sessionMap[s.name] = s.id;
    const [terms] = await conn.execute('SELECT id, sessionId, name FROM AcademicTerm');
    const termMap = {};
    for (const t of terms) {
      const sName = Object.keys(sessionMap).find(k => sessionMap[k] === t.sessionId);
      if (sName) termMap[sName + '_' + t.name.toLowerCase()] = t.id;
    }
    
    const [existingUsers] = await conn.execute('SELECT id, uniqueId FROM User');
    const userMap = {};
    for (const u of existingUsers) userMap[u.uniqueId] = u.id;
    const [existingStaff] = await conn.execute('SELECT userId FROM Staff');
    const staffUserIds = new Set(existingStaff.map(s => s.userId));
    const [existingStudents] = await conn.execute('SELECT userId FROM Student');
    const studentUserIds = new Set(existingStudents.map(s => s.userId));
    
    console.log('Existing users:', Object.keys(userMap).length);
    
    const { cols: staffCols, rows: staffRows } = parseSqlRows('staff');
    const { cols: usersCols, rows: usersRows } = parseSqlRows('users');
    console.log('Source staff:', staffRows.length, 'students:', usersRows.length);
    
    const staffToCreate = [];
    const studentsToCreate = [];
    for (const row of staffRows) {
      const uid = unquote(row[staffCols.indexOf('unique_id')]);
      if (SKIP_UNIQUE_IDS.has(uid) || !uid || userMap[uid]) continue;
      staffToCreate.push(row);
    }
    for (const row of usersRows) {
      const uid = unquote(row[usersCols.indexOf('student_id')]);
      if (SKIP_UNIQUE_IDS.has(uid) || !uid || userMap[uid]) continue;
      studentsToCreate.push(row);
    }
    console.log('Staff to create:', staffToCreate.length);
    console.log('Students to create:', studentsToCreate.length);
    
    if (staffToCreate.length === 0 && studentsToCreate.length === 0) {
      console.log('Nothing to migrate!');
      await conn.rollback();
      await conn.end();
      return;
    }
    
    console.log('Creating staff users...');
    for (const row of staffToCreate) {
      const uniqueId = unquote(row[staffCols.indexOf('unique_id')]);
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
          uniqueId, 'STAFF',
          unquote(row[staffCols.indexOf('firstname')]) || 'Staff',
          unquote(row[staffCols.indexOf('lastname')]) || '',
          unquote(row[staffCols.indexOf('email')]),
          unquote(row[staffCols.indexOf('telephone')]),
          unquote(row[staffCols.indexOf('password')]) || '$2y$10$default',
          unquote(row[staffCols.indexOf('image')]), 'ACTIVE'
        ]
      );
      userMap[uniqueId] = res.insertId;
    }
    console.log('Staff users done. Total users:', Object.keys(userMap).length);
    
    console.log('Creating student users...');
    for (const row of studentsToCreate) {
      const studentId = unquote(row[usersCols.indexOf('student_id')]);
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
          studentId, 'STUDENT',
          unquote(row[usersCols.indexOf('firstname')]) || 'Student',
          unquote(row[usersCols.indexOf('lastname')]) || '',
          unquote(row[usersCols.indexOf('email')]),
          unquote(row[usersCols.indexOf('telephone')]),
          unquote(row[usersCols.indexOf('password')]) || '$2y$10$default',
          unquote(row[usersCols.indexOf('image')]), 'ACTIVE'
        ]
      );
      userMap[studentId] = res.insertId;
    }
    console.log('Student users done. Total users:', Object.keys(userMap).length);
    
    console.log('Creating Staff records...');
    for (const row of staffToCreate) {
      const uniqueId = unquote(row[staffCols.indexOf('unique_id')]);
      const userId = userMap[uniqueId];
      if (!userId || staffUserIds.has(userId)) continue;
      await conn.execute(
        'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
          userId, uniqueId,
          unquote(row[staffCols.indexOf('state_of_origin')]),
          unquote(row[staffCols.indexOf('date_of_birth')]) || null,
          unquote(row[staffCols.indexOf('home_address')),
          unquote(row[staffCols.indexOf('about'))
        ]
      );
    }
    console.log('Staff records done');
    
    console.log('Creating Student records...');
    const [allClasses] = await conn.execute('SELECT id, name FROM ClassRoom WHERE schoolId = ?', [SCHOOL_ID]);
    const classMap = {};
    for (const c of allClasses) classMap[c.name] = c.id;
    const [globalClasses] = await conn.execute('SELECT id, name FROM ClassRoom');
    for (const c of globalClasses) classMap[c.name] = c.id;
    
    for (const row of studentsToCreate) {
      const studentId = unquote(row[usersCols.indexOf('student_id')]);
      const userId = userMap[studentId];
      if (!userId || studentUserIds.has(userId)) continue;
      const className = unquote(row[usersCols.indexOf('class')]);
      const classRoomId = className ? (classMap[className] || null) : null;
      await conn.execute(
        'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [
          userId, studentId, classRoomId,
          unquote(row[usersCols.indexOf('year_of_admission')),
          unquote(row[usersCols.indexOf('date_of_birth')]) || null,
          unquote(row[usersCols.indexOf('state_of_origin')),
          unquote(row[usersCols.indexOf('home_address')),
          unquote(row[usersCols.indexOf('father_name')),
          unquote(row[usersCols.indexOf('mother_name')),
          unquote(row[usersCols.indexOf('parent_image')),
          unquote(row[usersCols.indexOf('about'))
        ]
      );
    }
    console.log('Student records done');
    
    await conn.commit();
    console.log('\n=== MIGRATION COMMITTED ===');
    console.log('Users:', Object.keys(userMap).length);
    console.log('Staff', staffToCreate.length, 'Students', studentsToCreate.length);
    
  } catch (e) {
    await conn.rollback();
    console.error('ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
  await conn.end();
}

run().catch(e => console.error(e));
