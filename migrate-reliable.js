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
      if (rInStr) { if (ch === rSc && rowStr[i-1] !== '\\') rInStr = false; rCur += ch; }
      else {
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
    console.log('=== Load existing data ===');
    const [sessions] = await conn.execute('SELECT id, name FROM AcademicSession');
    const sessionMap = {};
    for (const s of sessions) sessionMap[s.name] = s.id;
    const [terms] = await conn.execute('SELECT id, sessionId, name FROM AcademicTerm');
    const termMap = {};
    for (const t of terms) {
      const sName = Object.keys(sessionMap).find(k => sessionMap[k] === t.sessionId);
      if (sName) termMap[sName + '_' + t.name.toLowerCase()] = t.id;
    }
    
    // Load existing users
    const [existingUsers] = await conn.execute('SELECT id, uniqueId FROM User');
    const userMap = {};
    for (const u of existingUsers) userMap[u.uniqueId] = u.id;
    console.log('Existing users:', Object.keys(userMap).length);
    
    // Load existing staff
    const [existingStaff] = await conn.execute('SELECT userId FROM Staff');
    const staffUserIds = new Set(existingStaff.map(s => s.userId));
    
    // Load existing students
    const [existingStudents] = await conn.execute('SELECT userId FROM Student');
    const studentUserIds = new Set(existingStudents.map(s => s.userId));
    
    console.log('Existing staff:', staffUserIds.size);
    console.log('Existing students:', studentUserIds.size);
    
    console.log('\n=== Parsing SQL ===');
    const { cols: staffCols, rows: staffRows } = parseSqlRows('staff');
    const { cols: usersCols, rows: usersRows } = parseSqlRows('users');
    console.log('Source staff:', staffRows.length, 'Source students:', usersRows.length);
    
    // Count what needs to be done
    const staffToCreate = [];
    const studentsToCreate = [];
    for (const row of staffRows) {
      const uid = unquote(row[staffCols.indexOf('unique_id')]);
      if (SKIP_UNIQUE_IDS.has(uid) || !uid) continue;
      if (!userMap[uid]) staffToCreate.push(row);
    }
    for (const row of usersRows) {
      const uid = unquote(row[usersCols.indexOf('student_id')]);
      if (SKIP_UNIQUE_IDS.has(uid) || !uid) continue;
      if (!userMap[uid]) studentsToCreate.push(row);
    }
    console.log('Staff to create:', staffToCreate.length);
    console.log('Students to create:', studentsToCreate.length);
    
    if (staffToCreate.length === 0 && studentsToCreate.length === 0) {
      console.log('Nothing to migrate!');
      await conn.rollback();
      await conn.end();
      return;
    }
    
    console.log('\n=== Creating users - Staff ===');
    let created = 0;
    for (const row of staffToCreate) {
      const uniqueId = unquote(row[staffCols.indexOf('unique_id')]);
      const firstName = unquote(row[staffCols.indexOf('firstname')]) || 'Staff';
      const lastName = unquote(row[staffCols.indexOf('lastname')]) || '';
      const email = unquote(row[staffCols.indexOf('email')]);
      const telephone = unquote(row[staffCols.indexOf('telephone')]);
      const password = unquote(row[staffCols.indexOf('password')]) || '$2y$10$default';
      const image = unquote(row[staffCols.indexOf('image')]);
      
      try {
        const [res] = await conn.execute(
          'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
          [uniqueId, 'STAFF', firstName, lastName, email, telephone, password, image, 'ACTIVE']
        );
        const userId = res.insertId;
        userMap[uniqueId] = userId;
        created++;
        if (created % 5 === 0) console.log('  ... created', created, 'staff users');
      } catch (e) {
        console.error('Staff user error:', uniqueId, e.message);
        await conn.rollback();
        throw e;
      }
    }
    console.log('Created', created, 'staff users');
    
    console.log('\n=== Creating users - Students ===');
    created = 0;
    for (const row of studentsToCreate) {
      const studentId = unquote(row[usersCols.indexOf('student_id')]);
      const firstName = unquote(row[usersCols.indexOf('firstname')]) || 'Student';
      const lastName = unquote(row[usersCols.indexOf('lastname')]) || '';
      const email = unquote(row[usersCols.indexOf('email')]);
      const telephone = unquote(row[usersCols.indexOf('telephone')]);
      const password = unquote(row[usersCols.indexOf('password')]) || '$2y$10$default';
      const image = unquote(row[usersCols.indexOf('image')]);
      
      try {
        const [res] = await conn.execute(
          'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
          [studentId, 'STUDENT', firstName, lastName, email, telephone, password, image, 'ACTIVE']
        );
        const userId = res.insertId;
        userMap[studentId] = userId;
        created++;
        if (created % 20 === 0) console.log('  ... created', created, 'student users');
      } catch (e) {
        console.error('Student user error:', studentId, e.message);
        await conn.rollback();
        throw e;
      }
    }
    console.log('Created', created, 'student users');
    
    console.log('\n=== Creating Staff records ===');
    let staffRecords = 0;
    for (const row of staffToCreate) {
      const uniqueId = unquote(row[staffCols.indexOf('unique_id')]);
      const userId = userMap[uniqueId];
      if (!userId) continue;
      if (staffUserIds.has(userId)) continue;
      const stateOfOrigin = unquote(row[staffCols.indexOf('state_of_origin')]);
      const dateOfBirth = unquote(row[staffCols.indexOf('date_of_birth')]);
      const homeAddress = unquote(row[staffCols.indexOf('home_address')]);
      const about = unquote(row[staffCols.indexOf('about')]);
      try {
        const [res] = await conn.execute(
          'INSERT INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
          [userId, uniqueId, stateOfOrigin, dateOfBirth || null, homeAddress, about]
        );
        staffRecords++;
        if (staffRecords % 5 === 0) console.log('  ... created', staffRecords, 'staff records');
      } catch (e) {
        console.error('Staff record error:', uniqueId, e.message);
        await conn.rollback();
        throw e;
      }
    }
    console.log('Created', staffRecords, 'staff records');
    
    console.log('\n=== Creating Student records ===');
    let stuRecords = 0;
    const [allClasses] = await conn.execute('SELECT id, name FROM ClassRoom WHERE schoolId = ?', [SCHOOL_ID]);
    const classMap = {};
    for (const c of allClasses) classMap[c.name] = c.id;
    const [globalClasses] = await conn.execute('SELECT id, name FROM ClassRoom');
    for (const c of globalClasses) classMap[c.name] = c.id;
    
    for (const row of studentsToCreate) {
      const studentId = unquote(row[usersCols.indexOf('student_id')]);
      const userId = userMap[studentId];
      if (!userId) continue;
      if (studentUserIds.has(userId)) continue;
      const className = unquote(row[usersCols.indexOf('class')]);
      let classRoomId = className ? (classMap[className] || null) : null;
      const [res] = await conn.execute(
        'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, studentId, classRoomId, unquote(row[usersCols.indexOf('year_of_admission')]), unquote(row[usersCols.indexOf('date_of_birth')]) || null, unquote(row[usersCols.indexOf('state_of_origin')]), unquote(row[usersCols.indexOf('home_address')]), unquote(row[usersCols.indexOf('father_name')]), unquote(row[usersCols.indexOf('mother_name')]), unquote(row[usersCols.indexOf('parent_image')]), unquote(row[usersCols.indexOf('about'))]
      );
      stuRecords++;
      if (stuRecords % 20 === 0) console.log('  ... created', stuRecords, 'student records');
    }
    console.log('Created', stuRecords, 'student records');
    
    await conn.commit();
    console.log('\n=== MIGRATION COMMITTED ===');
    console.log('Total users now:', Object.keys(userMap).length);
    console.log('New staff records:', staffRecords);
    console.log('New student records:', stuRecords);
    
  } catch (e) {
    await conn.rollback();
    console.error('MIGRATION FAILED:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
  await conn.end();
}

run().catch(e => console.error(e));
