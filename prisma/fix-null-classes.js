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

  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom');
  const classMap = new Map();
  classes.forEach(c => {
    classMap.set(c.name.toLowerCase(), c.id);
    classMap.set(c.name, c.id);
  });

  // Parse GKA users - match by studentNo directly
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  const lines = gkSql.split('\n').filter(l => l.trim().startsWith('(') && l.includes("'greatkings/"));

  // Find students still with NULL classRoomId
  const [nullStudents] = await conn.execute(
    'SELECT s.studentNo, s.id as sid FROM Student s WHERE s.classRoomId IS NULL'
  );

  console.log(`Found ${nullStudents.length} students with NULL classRoomId`);

  // For each null student, find class in SQL
  let updated = 0;
  for (const s of nullStudents) {
    // Find line with this studentNo
    for (const line of lines) {
      if (line.includes(`'${s.studentNo}'`)) {
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

        const classField = parts[10] || '';
        console.log(`${s.studentNo}: class="${classField}"`);

        if (classField) {
          // Try to find class match
          const classId = classMap.get(classField?.toLowerCase());
          if (classId) {
            await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [classId, s.sid]);
            updated++;
          }
        }
        break;
      }
    }
  }

  console.log(`\nUpdated ${updated} students`);

  // Final check
  const [final] = await conn.execute('SELECT classRoomId, COUNT(*) as cnt FROM Student GROUP BY classRoomId');
  const nullCount = final.find(d => d.classRoomId === null);
  console.log(`Students with NULL classRoomId: ${nullCount ? nullCount.cnt : 0}`);

  await conn.end();
})();