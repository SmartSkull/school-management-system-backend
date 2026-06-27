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

function parseSqlRows(sql, tableName) {
  const regex = new RegExp('INSERT INTO `' + tableName + '`.*?VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const match = sql.match(regex);
  if (!match) return [];
  const values = match[1].trim();
  if (!values) return [];
  const rows = [];
  const rowRegex = /\(([^)]+)\)/g;
  let m;
  while ((m = rowRegex.exec(values)) !== null) {
    const v = m[1];
    const vals = [];
    let cur = '', inStr = false, sc = '';
    for (let i = 0; i < v.length; i++) {
      const ch = v[i];
      if (inStr) {
        if (ch === sc && v[i-1] !== '\\') inStr = false;
        cur += ch;
      } else {
        if (ch === "'" || ch === '"') { inStr = true; sc = ch; cur += ch; }
        else if (ch === ',') { vals.push(cur.trim()); cur = ''; }
        else cur += ch;
      }
    }
    if (cur.trim()) vals.push(cur.trim());
    if (vals.length > 0 && vals[0] !== 'NULL') rows.push(vals);
  }
  return rows;
}

function getCols(sql, tableName) {
  const regex = new RegExp('CREATE TABLE `' + tableName + '` \\\\([\\s\\S]*?)\\) ENGINE=');
  const match = sql.match(regex);
  if (!match) return [];
  const cols = [];
  const cr = /`([^`]+)`\s+([^,\n]+)/g;
  let m;
  while ((m = cr.exec(match[1])) !== null) {
    cols.push(m[1]);
  }
  return cols;
}

async function run() {
  const conn = await mysql.createConnection(DB_CONFIG);
  const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');
  
  // Build maps
  const userMap = {};      // sourceUniqueId -> targetUserId
  const classMap = {};     // sourceClassName (with schoolId=9) -> targetClassRoomId
  const subjectMap = {};   // sourceSubjectName -> targetSubjectId
  const sessionMap = {};   // sourceSessionName -> targetAcademicSessionId
  const termMap = {};      // sourceSessionName + '_' + sourceTermName -> targetAcademicTermId
  
  await conn.beginTransaction();
  
  try {
    console.log('=== Step 1: Sessions & Terms (using existing) ===');
    const [sessions] = await conn.execute('SELECT id, name FROM AcademicSession');
    for (const s of sessions) sessionMap[s.name] = s.id;
    
    const [terms] = await conn.execute('SELECT id, sessionId, name FROM AcademicTerm');
    for (const t of terms) {
      const key = t.name;
      // Build two-level map: sessionName + '_' + termName -> termId
      for (const [sName, sId] of Object.entries(sessionMap)) {
        if (sId === t.sessionId) {
          termMap[sName + '_' + t.name.toLowerCase()] = t.id;
          break;
        }
      }
    }
    console.log('Loaded', sessions.length, 'sessions,', terms.length, 'terms');
    
    console.log('\n=== Step 2: ClassRooms ===');
    const classSource = parseSqlRows(sql, 'class');
    const classCols = getCols(sql, 'class');
    console.log('Source classes:', classSource.length);
    
    for (const row of classSource) {
      const className = row[classCols.indexOf('class')];
      if (!className) continue;
      // Check if exists for school 9
      const [existing] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? AND schoolId = ?', [className, SCHOOL_ID]);
      if (existing.length > 0) {
        classMap[className] = existing[0].id;
        continue;
      }
      const [res] = await conn.execute('INSERT INTO ClassRoom (schoolId, name, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())', [SCHOOL_ID, className]);
      classMap[className] = res.insertId;
      console.log('Created class:', className, 'id:', res.insertId);
    }
    console.log('Total classes mapped:', Object.keys(classMap).length);
    
    console.log('\n=== Step 3: Subjects ===');
    // Source calls them 'course'
    const courseSource = parseSqlRows(sql, 'course');
    const courseCols = getCols(sql, 'course');
    console.log('Source courses:', courseSource.length);
    
    const [existingSubjects] = await conn.execute('SELECT id, name FROM Subject');
    const existingSubjectNames = new Set(existingSubjects.map(s => s.name.toLowerCase()));
    
    for (const row of courseSource) {
      const courseName = row[courseCols.indexOf('courses')];
      if (!courseName) continue;
      // Check exact match first
      const [found] = await conn.execute('SELECT id FROM Subject WHERE name = ? LIMIT 1', [courseName]);
      if (found.length > 0) {
        subjectMap[courseName] = found[0].id;
        continue;
      }
      // Try case-insensitive
      const [found2] = await conn.execute('SELECT id FROM Subject WHERE LOWER(name) = LOWER(?) LIMIT 1', [courseName]);
      if (found2.length > 0) {
        subjectMap[courseName] = found2[0].id;
        continue;
      }
      // Create new subject
      const [res] = await conn.execute('INSERT INTO Subject (name, createdAt, updatedAt) VALUES (?, NOW(), NOW())', [courseName]);
      subjectMap[courseName] = res.insertId;
      console.log('Created subject:', courseName, 'id:', res.insertId);
    }
    console.log('Total subjects mapped:', Object.keys(subjectMap).length);
    
    console.log('\n=== Step 4: Users from admin table ===');
    const adminSource = parseSqlRows(sql, 'admin');
    const adminCols = getCols(sql, 'admin');
    console.log('Source admin rows:', adminSource.length);
    for (const row of adminSource) {
      const uniqueId = row[adminCols.indexOf('unique_id')];
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) {
        console.log('Skipping admin:', uniqueId);
        continue;
      }
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
      console.log('Created admin user:', uniqueId, 'id:', res.insertId);
    }
    
    console.log('\n=== Step 5: Users from staff table ===');
    const staffSource = parseSqlRows(sql, 'staff');
    const staffCols = getCols(sql, 'staff');
    console.log('Source staff rows:', staffSource.length);
    for (const row of staffSource) {
      const uniqueId = row[staffCols.indexOf('unique_id')];
      if (!uniqueId || SKIP_UNIQUE_IDS.has(uniqueId)) {
        console.log('Skipping staff user:', uniqueId);
        continue;
      }
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
      console.log('Created staff user:', uniqueId, 'userId:', userId, 'staffId:', staffRes.insertId);
    }
    
    console.log('\n=== Step 6: Users from users table (students) ===');
    const studentSource = parseSqlRows(sql, 'users');
    const studentCols = getCols(sql, 'users');
    console.log('Source student rows:', studentSource.length);
    for (const row of studentSource) {
      const studentId = row[studentCols.indexOf('student_id')];
      if (!studentId) continue;
      if (SKIP_UNIQUE_IDS.has(studentId)) continue;
      
      const firstName = row[studentCols.indexOf('firstname')] || 'Student';
      const lastName = row[studentCols.indexOf('lastname')] || '';
      const email = row[studentCols.indexOf('email')] || null;
      const telephone = row[studentCols.indexOf('telephone')] || null;
      const password = row[studentCols.indexOf('password')] || '$2y$10$default';
      const image = row[studentCols.indexOf('image')] || null;
      const gender = row[studentCols.indexOf('gender')] || null;
      const dateOfBirth = row[studentCols.indexOf('date_of_birth')] || null;
      const stateOfOrigin = row[studentCols.indexOf('state_of_origin')] || null;
      const homeAddress = row[studentCols.indexOf('home_address')] || null;
      const about = row[studentCols.indexOf('about')] || null;
      const admissionYear = row[studentCols.indexOf('year_of_admission')] || null;
      const fatherName = row[studentCols.indexOf('father_name')] || null;
      const motherName = row[studentCols.indexOf('mother_name')] || null;
      const parentImage = row[studentCols.indexOf('parent_image')] || null;
      
      const [res] = await conn.execute(
        'INSERT INTO User (uniqueId, role, firstName, lastName, email, telephone, password, image, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [studentId, 'STUDENT', firstName, lastName, email, telephone, password, image, 'ACTIVE']
      );
      const userId = res.insertId;
      userMap[studentId] = userId;
      
      // Get classRoomId from class name
      const className = row[studentCols.indexOf('class')];
      let classRoomId = null;
      if (className && classMap[className]) {
        classRoomId = classMap[className];
      } else if (className) {
        const [cls] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ? LIMIT 1', [className]);
        if (cls.length > 0) classRoomId = cls[0].id;
      }
      
      const [studRes] = await conn.execute(
        'INSERT INTO Student (userId, studentNo, classRoomId, admissionYear, dateOfBirth, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [userId, studentId, classRoomId, admissionYear, dateOfBirth || null, stateOfOrigin, homeAddress, fatherName, motherName, parentImage, about]
      );
      if (studRes.insertId % 20 === 0) console.log('  ... imported', studRes.insertId, 'students');
    }
    console.log('All students imported:', Object.keys(userMap).filter(k => k.startsWith('greatkings/') || k.startsWith('student/')).length);
    
    await conn.commit();
    console.log('\n=== Phase 1 committed (Users, Classes, Subjects) ===');
    
  } catch (e) {
    await conn.rollback();
    console.error('Error:', e.message);
    process.exit(1);
  }
  
  await conn.end();
}

run().catch(e => console.error(e));
