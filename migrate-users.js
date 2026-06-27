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
    if (last !== null && String(last).trim() !== '') vals.push(last);
    if (vals.length > 0) parsedRows.push(vals);
  }
  return { cols, rows: parsedRows };
}

async function bulkInsert(conn, sql, values) {
  if (values.length === 0) return;
  const [res] = await conn.execute(sql, [values]);
  return res;
}

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  await conn.beginTransaction();
  
  try {
    console.log('Loading sessions/terms...');
    const [sessions] = await conn.execute('SELECT id, name FROM AcademicSession');
    const sessionMap = {};
    for (const s of sessions) sessionMap[s.name] = s.id;
    const [terms] = await conn.execute('SELECT id, sessionId, name FROM AcademicTerm');
    const termMap = {};
    for (const t of terms) {
      const sName = Object.keys(sessionMap).find(k => sessionMap[k] === t.sessionId);
      if (sName) termMap[sName + '_' + t.name.toLowerCase()] = t.id;
    }
    
    console.log('Loading classes...');
    const { cols: classCols, rows: classRows } = parseSqlRows('class');
    const classMap = {};
    for (const row of classRows) {
      const className = unquote(row[classCols.indexOf('class')]);
      if (!className) continue;
      const [existing] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? AND schoolId = ?', [className, SCHOOL_ID]);
      if (existing.length > 0) { classMap[className] = existing[0].id; continue; }
      const [res] = await conn.execute('INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())', [SCHOOL_ID, className]);
      classMap[className] = res.insertId;
    }
    console.log('Classes:', Object.keys(classMap).length);
    
    console.log('Loading subjects...');
    const { cols: courseCols, rows: courseRows } = parseSqlRows('course');
    const subjectMap = {};
    for (const row of courseRows) {
      const courseName = unquote(row[courseCols.indexOf('courses')]);
      if (!courseName) continue;
      const [found] = await conn.execute('SELECT id FROM Subject WHERE name = ? LIMIT 1', [courseName]);
      if (found.length > 0) { subjectMap[courseName] = found[0].id; continue; }
      const [res] = await conn.execute('INSERT INTO Subject (name, createdAt, updatedAt) VALUES (?, NOW(), NOW())', [courseName]);
      subjectMap[courseName] = res.insertId;
    }
    console.log('Subjects:', Object.keys(subjectMap).length);
    
    console.log('Loading existing users...');
    const [existingUsers] = await conn.execute('SELECT id, uniqueId FROM User');
    const existingUserMap = {};
    for (const u of existingUsers) existingUserMap[u.uniqueId] = u.id;
    const userMap = {...existingUserMap};
    
    console.log('Parsing users...');
    const { cols: adminCols, rows: adminRows } = parseSqlRows('admin');
    const { cols: staffCols, rows: staffRows } = parseSqlRows('staff');
    const { cols: usersCols, rows: usersRows } = parseSqlRows('users');
    
    const allUserInserts = [];
    const staffExtras = [];
    const studentExtras = [];
    
    for (const row of adminRows) {
      const uniqueId = unquote(row[adminCols.indexOf('unique_id')]);
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) continue;
      allUserInserts.push([uniqueId, 'ADMIN', unquote(row[adminCols.indexOf('other_names')]) || 'Admin', unquote(row[adminCols.indexOf('surname')]) || '', unquote(row[adminCols.indexOf('email')]), unquote(row[adminCols.indexOf('telephone')]), unquote(row[adminCols.indexOf('password')]) || '$2y$10$default', unquote(row[adminCols.indexOf('image')]), 'ACTIVE']);
    }
    
    for (const row of staffRows) {
      const uniqueId = unquote(row[staffCols.indexOf('unique_id')]);
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) continue;
      allUserInserts.push([uniqueId, 'STAFF', unquote(row[staffCols.indexOf('firstname')]) || 'Staff', unquote(row[staffCols.indexOf('lastname')]) || '', unquote(row[staffCols.indexOf('email')]), unquote(row[staffCols.indexOf('telephone')]), unquote(row[staffCols.indexOf('password')]) || '$2y$10$default', unquote(row[staffCols.indexOf('image')]), 'ACTIVE']);
      staffExtras.push({ uniqueId, stateOfOrigin: unquote(row[staffCols.indexOf('state_of_origin')]), dateOfBirth: unquote(row[staffCols.indexOf('date_of_birth')]), homeAddress: unquote(row[staffCols.indexOf('home_address')]), about: unquote(row[staffCols.indexOf('about')]) });
    }
    
    for (const row of usersRows) {
      const studentId = unquote(row[usersCols.indexOf('student_id')]);
      if (!studentId || SKIP_UNIQUE_IDS.has(studentId)) continue;
      allUserInserts.push([studentId, 'STUDENT', unquote(row[usersCols.indexOf('firstname')]) || 'Student', unquote(row[usersCols.indexOf('lastname')]) || '', unquote(row[usersCols.indexOf('email')]), unquote(row[usersCols.indexOf('telephone')]), unquote(row[usersCols.indexOf('password')]) || '$2y$10$default', unquote(row[usersCols.indexOf('image')]), 'ACTIVE']);
      const className = unquote(row[usersCols.indexOf('class')]);
      let classRoomId = null;
      if (className) {
        if (classMap[className]) classRoomId = classMap[className];
        else {
          const [cls] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? LIMIT 1', [className]);
          if (cls.length > 0) { classRoomId = cls[0].id; classMap[className] = classRoomId; }
        }
      }
      studentExtras.push({ uniqueId: studentId, classRoomId, admissionYear: unquote(row[usersCols.indexOf('year_of_admission')]), dateOfBirth: unquote(row[usersCols.indexOf('date_of_birth')]), stateOfOrigin: unquote(row[usersCols.indexOf('state_of_origin')]), homeAddress: unquote(row[usersCols.indexOf('home_address')]), about: unquote(row[usersCols.indexOf('about')]), fatherName: unquote(row[usersCols.indexOf('father_name')]), motherName: unquote(row[usersCols.indexOf('mother_name')]), parentImage: unquote(row[usersCols.indexOf('parent_image')]) });
    }
    
    console.log('Bulk inserting', allUserInserts.length, 'users...');
    if (allUserInserts.length > 0) {
      const [res] = await conn.execute('INSERT IGNORE INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES ?', [allUserInserts]);
      console.log('Inserted users:', res.affectedRows);
      const [newUsers] = await conn.execute('SELECT id, uniqueId FROM User WHERE uniqueId IN (?)', [allUserInserts.map(r => r[0])]);
      for (const u of newUsers) userMap[u.uniqueId] = u.id;
    }
    
    console.log('Inserting staff records...');
    const staffRecords = [];
    const staffNoSet = new Set();
    for (const s of staffExtras) {
      if (!userMap[s.uniqueId]) continue;
      if (staffNoSet.has(s.uniqueId)) continue;
      staffNoSet.add(s.uniqueId);
      staffRecords.push([userMap[s.uniqueId], s.uniqueId, s.stateOfOrigin, s.dateOfBirth || null, s.homeAddress, s.about]);
    }
    if (staffRecords.length > 0) {
      const [res] = await conn.execute('INSERT IGNORE INTO Staff (userId, staffNo, stateOfOrigin, dateOfBirth, homeAddress, about, createdAt, updatedAt) VALUES ?', [staffRecords]);
      console.log('Inserted staff:', res.affectedRows);
    }
    
    console.log('Inserting student records...');
    const studentRecords = [];
    const studentNoSet = new Set();
    for (const s of studentExtras) {
      if (!userMap[s.uniqueId]) continue;
      if (studentNoSet.has(s.uniqueId)) continue;
      studentNoSet.add(s.uniqueId);
      studentRecords.push([userMap[s.uniqueId], s.uniqueId, s.classRoomId, s.admissionYear, s.dateOfBirth || null, s.stateOfOrigin, s.homeAddress, s.fatherName, s.motherName, s.parentImage, s.about]);
    }
    if (studentRecords.length > 0) {
      const [res] = await conn.execute('INSERT IGNORE INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES ?', [studentRecords]);
      console.log('Inserted students:', res.affectedRows);
    }
    
    await conn.commit();
    console.log('\n=== Phase 1 COMMITTED ===');
    console.log('Users mapped:', Object.keys(userMap).length);
    
    fs.writeFileSync('C:/xampp/htdocs/florieren/nestjs-backend/userMap.json', JSON.stringify(userMap));
    fs.writeFileSync('C:/xampp/htdocs/florieren/nestjs-backend/classMap.json', JSON.stringify(classMap));
    fs.writeFileSync('C:/xampp/htdocs/florieren/nestjs-backend/subjectMap.json', JSON.stringify(subjectMap));
    fs.writeFileSync('C:/xampp/htdocs/florieren/nestjs-backend/sessionMap.json', JSON.stringify(sessionMap));
    fs.writeFileSync('C:/xampp/htdocs/florieren/nestjs-backend/termMap.json', JSON.stringify(termMap));
    
  } catch (e) {
    await conn.rollback();
    console.error('ERROR:', e.message);
    console.error(e.stack);
    process.exit(1);
  }
  await conn.end();
}

run().catch(e => console.error(e));
