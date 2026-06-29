const mysql = require('mysql2/promise');
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

  // Create missing session 2025/2026 for Florieren (schoolId 8)
  const [existing] = await conn.execute('SELECT id FROM AcademicSession WHERE schoolId = 8 AND name = ?', ['2025/2026']);
  if (existing.length === 0) {
    const result = await conn.execute('INSERT INTO AcademicSession (name, schoolId, createdAt, updatedAt) VALUES (?, 8, NOW(), NOW())', ['2025/2026']);
    console.log('Created session 2025/2026 for Florieren');
    
    // Get the new session ID
    const lastId = result[0].insertId;
    
    // Create terms for this session
    for (const term of ['FIRST', 'SECOND', 'THIRD']) {
      await conn.execute('INSERT INTO AcademicTerm (sessionId, name, createdAt, updatedAt) VALUES (?, ?, NOW(), NOW())', [lastId, term]);
    }
    console.log('Created terms for Florieren 2025/2026');
  }

  // Verify Florieren students exist
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync('clean-attendance.json', 'utf8'));
  const flStudents = [...new Set(data.filter(r => r.studentId.startsWith('fpis')).map(r => r.studentId))];
  
  const placeholders = flStudents.map(() => '?').join(',');
  const [found] = await conn.execute(`SELECT studentNo FROM Student WHERE studentNo IN (${placeholders})`, flStudents);
  console.log(`\nFlorieren students in DB: ${found.length} out of ${flStudents.length}`);
  
  const missing = flStudents.filter(id => !found.some(s => s.studentNo === id));
  if (missing.length > 0) {
    console.log('Missing students:', missing.slice(0, 10).join(', '));
  }

  await conn.end();
})();