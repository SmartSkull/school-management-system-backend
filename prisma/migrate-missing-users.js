const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

const FLORIEREN_HASH = '$2a$12$1FIJWpe8kDVwGmygHntDWOhk7vNQnClUrTXUjGsLudXAOvFnJ1Iau';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  const gkUsers = JSON.parse(fs.readFileSync('gka-users.json', 'utf8'));
  const flUsers = JSON.parse(fs.readFileSync('florieren-users.json', 'utf8'));
  const allUsers = [...gkUsers, ...flUsers];

  const [existing] = await conn.execute('SELECT uniqueId FROM User');
  const existingIds = new Set(existing.map(u => u.uniqueId));

  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => {
    classMap.set(c.name.toLowerCase(), c.id);
    classMap.set(c.name, c.id);
  });

  const missingUsers = allUsers.filter(u => !existingIds.has(u.studentId));
  console.log(`Migrating ${missingUsers.length} missing users...`);

  let migrated = 0;
  for (const u of missingUsers) {
    const classId = classMap.get(u.className?.toLowerCase()) || null;
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const safeFirst = (u.firstname || 'Unknown').substring(0, 100);
    const safeMiddle = (u.middlename || '').substring(0, 100);
    const safeLast = (u.lastname || 'Unknown').substring(0, 100);
    
    try {
      // Insert User with all required fields
      const [r1] = await conn.execute(
        'INSERT INTO User (uniqueId, schoolId, role, firstName, middleName, lastName, password, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [u.studentId, u.schoolId, 'STUDENT', safeFirst, safeMiddle, safeLast, FLORIEREN_HASH, 'ACTIVE']
      );

      // Insert Student
      await conn.execute(
        'INSERT INTO Student (userId, studentNo, classRoomId, fatherName, motherName, parentImage, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
        [r1.insertId, u.studentId, classId, u.fatherName || '', u.motherName || '', u.parentImage || 'image.png']
      );

      migrated++;
      if (migrated % 20 === 0) process.stdout.write(`Progress: ${migrated}/${missingUsers.length}\n`);
    } catch (e) {
      console.log(`Error ${u.studentId}: ${e.message.substring(0, 60)}`);
    }
  }

  console.log(`\nMigrated ${migrated} users`);

  const [final] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  console.log(`Student records now: ${final[0].c}`);

  await conn.end();
})();