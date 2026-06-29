const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  // Get class mappings
  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => classMap.set(c.name, c.id));
  console.log('Classes in DB:');
  classes.forEach(c => console.log(`  ${c.name} (id=${c.id})`));

  // Get existing users
  const gkUsers = JSON.parse(fs.readFileSync('gka-users.json', 'utf8'));
  const flUsers = JSON.parse(fs.readFileSync('florieren-users.json', 'utf8'));

  const allUsers = [...gkUsers, ...flUsers];
  const studentIds = allUsers.map(u => u.studentId);

  // Check which users exist
  const placeholders = studentIds.map(() => '?').join(',');
  const [existing] = await conn.execute(`SELECT uniqueId, role, schoolId FROM User WHERE uniqueId IN (${placeholders})`, studentIds);

  console.log(`\nUsers in DB: ${existing.length} out of ${studentIds.length}`);
  console.log('Missing users:', studentIds.length - existing.length);

  // Check missing student records
  const existingIds = existing.map(u => u.uniqueId);
  const [studentRecs] = await conn.execute('SELECT studentNo FROM Student');
  const studentNos = studentRecs.map(s => s.studentNo);

  const missingStudentRecords = existingIds.filter(id => !studentNos.includes(id));
  console.log(`Existing Users but missing Student records: ${missingStudentRecords.length}`);

  // Show sample of missing
  if (missingStudentRecords.length > 0) {
    console.log('\nSample missing Student records:', missingStudentRecords.slice(0, 5));
  }

  // Get classRoomId mapping for missing users
  const missingUsers = allUsers.filter(u => existingIds.includes(u.studentId));
  console.log(`\nMissing Student records with class info: ${missingUsers.length}`);
  missingUsers.forEach(u => {
    const classId = classMap.get(u.className);
    console.log(`${u.studentId}: class="${u.className}" -> classId=${classId || 'NOT FOUND'}`);
  });

  await conn.end();
})();