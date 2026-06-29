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

  console.log('Updating classRoomId for GKA students...\n');

  // Get class mappings
  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => {
    classMap.set(c.name.toLowerCase(), c.id);
    classMap.set(c.name, c.id);
  });

  console.log('Available classes:', classes.length);
  classes.forEach(c => console.log(`  ${c.name} (id=${c.id})`));

  // Parse GKA users to get class info
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  const lines = gkSql.split('\n').filter(l => l.trim().startsWith('(') && l.includes("'greatkings/"));

  let updated = 0;
  let skipped = 0;

  for (const line of lines) {
    const parts = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "'") inQuote = !inQuote;
      else if (char === ',' && !inQuote) {
        parts.push(current.trim().replace(/^'|'$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current.trim().replace(/^'|'$/g, ''));

    if (parts.length > 10) {
      const studentId = parts[1] || '';
      const classField = parts[10] || '';
      
      if (studentId && studentId.includes('greatkings/')) {
        const classId = classMap.get(classField);
        if (classId) {
          await conn.execute(
            'UPDATE Student SET classRoomId = ? WHERE studentNo = ?',
            [classId, studentId]
          );
          updated++;
        } else if (classField) {
          skipped++;
        }
      }
    }
  }

  console.log(`\nUpdated ${updated} students with classRoomId`);
  console.log(`Skipped ${skipped} students (class not found in DB)`);

  // Final class distribution
  const [dist] = await conn.execute('SELECT classRoomId, COUNT(*) as cnt FROM Student GROUP BY classRoomId');
  const nullCount = dist.find(d => d.classRoomId === null || d.classRoomId === undefined);
  console.log(`\nStudents with NULL classRoomId: ${nullCount ? nullCount.cnt : 0}`);

  await conn.end();
})();