const fs = require('fs');
const mysql = require('mysql2/promise');
const dotenv = require('dotenv');

dotenv.config();

// Generate bcrypt hash for "florieren"
// $2b$10$... format for bcrypt
const bcryptHash = '$2b$10$abcdefghijklmnopqrstuvN0bzaN0bzabcdefghijklmnopqrstu'; // Placeholder - will use plain text

// Pre-computed bcrypt for "florieren" 
const FLORIEREN_HASH = '$2a$12$1FIJWpe8kDVwGmygHntDWOhk7vNQnClUrTXUjGsLudXAOvFnJ1Iau';

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  const gkUsers = JSON.parse(fs.readFileSync('gka-users.json', 'utf8'));
  const flUsers = JSON.parse(fs.readFileSync('florieren-users.json', 'utf8'));
  const allUsers = [...gkUsers, ...flUsers];

  const [existing] = await conn.execute('SELECT uniqueId FROM User WHERE uniqueId IN (?)', 
    [allUsers.map(u => u.studentId)]);
  const existingIds = new Set(existing.map(u => u.uniqueId));
  const missingUsers = allUsers.filter(u => !existingIds.has(u.studentId));

  // Get class mapping
  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => {
    classMap.set(c.name.toLowerCase(), c.id);
    classMap.set(c.name, c.id);
  });

  // Generate User SQL with bcrypt password
  let userValues = [];
  let studentValues = [];
  
  for (const u of missingUsers) {
    const classId = classMap.get(u.className?.toLowerCase()) || null;
    const safeMiddlename = (u.middlename || '').substring(0, 100);
    const safeFirstname = (u.firstname || 'Unknown').substring(0, 100);
    const safeLastname = (u.lastname || 'Unknown').substring(0, 100);
    
    const userId = `${u.studentId}_id`; // placeholder for SQL
    
    userValues.push(`('${u.studentId}', ${u.schoolId}, 'STUDENT', '${safeFirstname}', '${escapeStr(safeMiddlename)}', '${safeLastname}', '${FLORIEREN_HASH}', 'ACTIVE')`);
    studentValues.push(`(LAST_INSERT_ID(), '${u.studentId}', ${classId || 'NULL'}, '${escapeStr(u.fatherName)}', '${escapeStr(u.motherName)}', '${u.parentImage || 'image.png'}')`);
  }

  // Write User insert (use LAST_INSERT_ID for Student insert)
  fs.writeFileSync('missing-users-insert.sql', 
    `-- Missing Users Migration (${missingUsers.length} users)\n` +
    `-- Run these queries in order:\n\n` +
    `INSERT INTO User (uniqueId, schoolId, role, firstName, middleName, lastName, password, status) VALUES\n${userValues.join(',\n')};\n`
  );

  console.log(`Generated missing-users-insert.sql with ${userValues.length} users`);
  console.log('All users will have password: "florieren"');

  // Check how many have valid class
  let withClass = 0;
  let withoutClass = 0;
  for (const u of missingUsers) {
    if (classMap.has(u.className?.toLowerCase())) withClass++;
    else withoutClass++;
  }
  console.log(`Users with valid class: ${withClass}, without class: ${withoutClass}`);

  await conn.end();
})();

function escapeStr(str) {
  return (str || '').replace(/'/g, "\\'").substring(0, 255);
}