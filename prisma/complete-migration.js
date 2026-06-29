/**
 * Complete Migration Fix - handles missing users, classes, and attendance
 */

const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  console.log('🔧 Running complete migration fixes...\n');

  // 1. Create missing "Finished" class
  const [finishedCheck] = await conn.execute('SELECT id FROM ClassRoom WHERE name = ?', ['Finished']);
  if (finishedCheck.length === 0) {
    // Get Florieren schoolId (8)
    await conn.execute('INSERT INTO ClassRoom (name, schoolId, createdAt, updatedAt) VALUES (?, 8, NOW(), NOW())', ['Finished']);
    console.log('✅ Created Finished class for Florieren');
  }

  // 2. Get class mapping
  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => {
    // Case-insensitive mapping
    const lower = c.name.toLowerCase();
    classMap.set(lower, c.id);
    // Also store original
    classMap.set(c.name, c.id);
  });

  // 3. Load user data
  const gkUsers = JSON.parse(fs.readFileSync('gka-users.json', 'utf8'));
  const flUsers = JSON.parse(fs.readFileSync('florieren-users.json', 'utf8'));
  const allUsers = [...gkUsers, ...flUsers];

  // 4. Get existing users
  const placeholders = allUsers.map(() => '?').join(',');
  const [existing] = await conn.execute(`SELECT uniqueId, schoolId FROM User WHERE uniqueId IN (${placeholders})`, 
    allUsers.map(u => u.studentId));

  const existingIds = new Set(existing.map(u => u.uniqueId));
  const missingUsers = allUsers.filter(u => !existingIds.has(u.studentId));

  console.log(`\nMissing users to create: ${missingUsers.length}`);

  // 5. Create missing users
  let created = 0;
  for (const user of missingUsers) {
    const classId = classMap.get(user.className?.toLowerCase()) || null;
    
    try {
      // Insert User
      const [result] = await conn.execute(
        `INSERT INTO User (uniqueId, schoolId, role, firstName, middleName, lastName, status, createdAt, updatedAt)
         VALUES (?, ?, 'STUDENT', ?, ?, ?, 'ACTIVE', NOW(), NOW())`,
        [user.studentId, user.schoolId, user.firstname || 'Unknown', user.middlename, user.lastname || 'Unknown']
      );

      // Insert Student record
      await conn.execute(
        `INSERT INTO Student (userId, studentNo, classRoomId, fatherName, motherName, parentImage, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
        [result.insertId, user.studentId, classId, user.fatherName, user.motherName, user.parentImage]
      );

      created++;
    } catch (e) {
      console.log(`Error creating ${user.studentId}: ${e.message.substring(0, 50)}`);
    }
  }
  console.log(`\n✅ Created ${created} missing users with student records`);

  // 6. Now update classRoomId for existing students who have NULL
  const flUsersWithClass = flUsers.filter(u => u.className && u.className !== 'none' && u.className !== '');
  let updatedClasses = 0;
  
  for (const user of flUsersWithClass) {
    if (existingIds.has(user.studentId)) {
      const classId = classMap.get(user.className?.toLowerCase()) || classMap.get(user.className) || null;
      if (classId) {
        await conn.execute(
          'UPDATE Student SET classRoomId = ? WHERE studentNo = ?',
          [classId, user.studentId]
        );
        updatedClasses++;
      }
    }
  }
  console.log(`✅ Updated ${updatedClasses} student classRoomIds`);

  // 7. Final counts
  const [counts] = await Promise.all([
    conn.execute('SELECT COUNT(*) as c FROM User'),
    conn.execute('SELECT COUNT(*) as c FROM Student'),
    conn.execute('SELECT COUNT(*) as c FROM Attendance')
  ]);

  console.log(`\n=== FINAL COUNTS ===`);
  console.log(`Users: ${counts[0][0].c}`);
  console.log(`Students: ${counts[1][0].c}`);
  console.log(`Attendance: ${counts[2][0].c}`);

  // Save attendance SQL for manual import if needed
  const attendData = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8'));
  const [sessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession');
  const sessionMap = new Map();
  sessions.forEach(s => sessionMap.set(`${s.schoolId}_${s.name}`, s));

  const [terms] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm');
  const termMap = new Map();
  terms.forEach(t => termMap.set(`${t.sessionId}_${t.name}`, t.id));

  const [students] = await conn.execute('SELECT id, studentNo FROM Student');
  const studentMap = new Map();
  students.forEach(s => studentMap.set(s.studentNo, s.id));

  const toInsert = [];
  for (const r of attendData) {
    const studentDbId = studentMap.get(r.studentId);
    if (!studentDbId) continue;

    const schoolId = r.studentId.startsWith('greatkings') ? 9 : 8;
    const sess = sessionMap.get(`${schoolId}_${r.session}`);
    if (!sess) continue;

    const termId = termMap.get(`${sess.id}_${r.term.toUpperCase()}`);
    if (!termId) continue;

    const present = parseNumeric(r.present);
    const absent = parseNumeric(r.absent);

    toInsert.push([studentDbId, sess.id, termId, present, absent, r.comment || '', r.principal || '']);
  }

  fs.writeFileSync('attendance-final.sql', 
    `INSERT INTO Attendance (studentId, sessionId, termId, present, absent, teacherComment, principalComment, createdAt, updatedAt) VALUES\n` +
    toInsert.map(r => `(${r[0]}, ${r[1]}, ${r[2]}, ${r[3]}, ${r[4]}, '${escape(r[5])}', '${escape(r[6])}', NOW(), NOW())`).join(',\n') + ';\n'
  );
  
  console.log(`\nWrote attendance-final.sql with ${toInsert.length} records`);

  await conn.end();
}

function parseNumeric(val) {
  if (!val || val.trim() === '' || val.toLowerCase() === 'nil' || val.toLowerCase() === 'null' || val.trim() === '-') {
    return 0;
  }
  const parsed = parseInt(val.trim(), 10);
  return isNaN(parsed) ? 0 : parsed;
}

function escape(str) {
  return (str || '').replace(/'/g, "\\'").replace(/\\r\\n/g, ' ').substring(0, 500);
}

run().catch(console.error);