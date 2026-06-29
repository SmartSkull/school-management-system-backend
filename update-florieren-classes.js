const mysql = require('mysql2/promise');
const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_florieren.sql', 'utf8');

function parseSqlRow(rowStr) {
  const values = [];
  let current = '';
  let inString = false;
  let quoteChar = null;
  
  for (let i = 0; i < rowStr.length; i++) {
    const ch = rowStr[i];
    
    if (inString) {
      if (ch === quoteChar && rowStr[i - 1] !== '\\') {
        inString = false;
      }
      current += ch;
    } else {
      if (ch === "'" || ch === '"') {
        inString = true;
        quoteChar = ch;
        current += ch;
      } else if (ch === ',') {
        values.push(current.trim().replace(/^['"]|['"]$/g, ''));
        current = '';
      } else {
        current += ch;
      }
    }
  }
  
  if (current.trim()) {
    values.push(current.trim().replace(/^['"]|['"]$/g, ''));
  }
  
  return values;
}

// Build complete class map from ALL users INSERT blocks in the SQL
const usersRegex = /INSERT INTO `users`\s*\(([^)]+)\)\s*VALUES\s*([\s\S]+?);/gi;
let usersMatch;
const userClassMap = {};
let totalParsed = 0;

while ((usersMatch = usersRegex.exec(sql)) !== null) {
  const cols = usersMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const valuesBlock = usersMatch[2];
  const studentIdx = cols.indexOf('student_id');
  const classIdx = cols.indexOf('class');
  const rowRegex = /\(([^)]+)\)(?:,\s*)?/g;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(valuesBlock)) !== null) {
    const values = parseSqlRow(rowMatch[1]);
    const sid = values[studentIdx];
    const cls = values[classIdx];
    
    if (sid) {
      totalParsed++;
      if (cls) userClassMap[sid] = cls;
    }
  }
}

console.log('Total users parsed from SQL:', totalParsed);
console.log('Users with class data:', Object.keys(userClassMap).length);

const statusClasses = ['completed', 'left', 'Finished'];
const validClassCount = Object.values(userClassMap).filter(c => !statusClasses.includes(c)).length;
console.log('Users with valid class:', validClassCount);
console.log('Users with status class:', Object.keys(userClassMap).length - validClassCount);

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  
  const [school8] = await conn.execute("SELECT id FROM School WHERE slug = 'florieren-1'");
  const schoolId = school8[0].id;
  
  // Get all classes for school 8
  const [classes] = await conn.execute('SELECT id, name FROM ClassRoom WHERE schoolId = ?', [schoolId]);
  const classMap = {};
  classes.forEach(c => classMap[c.name] = c.id);
  console.log('\nClasses in DB:', Object.entries(classMap).map(([k,v]) => k + '=' + v).join(', '));
  
  // Get all students for school 8
  const [students] = await conn.execute(`
    SELECT s.id as studentId, u.uniqueId, s.classRoomId
    FROM Student s 
    JOIN User u ON s.userId = u.id 
    WHERE u.schoolId = ?
  `, [schoolId]);
  
  console.log('Total school 8 students:', students.length);
  
  let assigned = 0;
  let setNull = 0;
  let skipped = 0;
  let notInSql = 0;
  
  for (const student of students) {
    const sqlClass = userClassMap[student.uniqueId];
    
    if (!sqlClass) {
      notInSql++;
      continue;
    }
    
    if (statusClasses.includes(sqlClass)) {
      await conn.execute('UPDATE Student SET classRoomId = NULL WHERE id = ?', [student.studentId]);
      setNull++;
    } else if (classMap[sqlClass]) {
      await conn.execute('UPDATE Student SET classRoomId = ? WHERE id = ?', [classMap[sqlClass], student.studentId]);
      assigned++;
    } else {
      skipped++;
      console.log('  Skipped (class not in DB):', student.uniqueId, '->', sqlClass);
    }
  }
  
  console.log('\nResults:');
  console.log('  Assigned to class:', assigned);
  console.log('  Set to NULL (status):', setNull);
  console.log('  Skipped (class not in DB):', skipped);
  console.log('  Not in SQL:', notInSql);
  
  // Final distribution
  const [final] = await conn.execute(`
    SELECT c.name, COUNT(s.id) as cnt
    FROM ClassRoom c
    LEFT JOIN Student s ON s.classRoomId = c.id
    WHERE c.schoolId = ?
    GROUP BY c.id, c.name
    ORDER BY c.name
  `, [schoolId]);
  
  console.log('\nFinal class distribution:');
  let total = 0;
  final.forEach(c => {
    console.log('  ' + (c.name || 'NULL') + ': ' + c.cnt);
    total += c.cnt;
  });
  
  const [nullCount] = await conn.execute(`
    SELECT COUNT(*) as c FROM Student s 
    JOIN User u ON s.userId = u.id 
    WHERE u.schoolId = ? AND s.classRoomId IS NULL
  `, [schoolId]);
  console.log('NULL class:', nullCount[0].c);
  console.log('Total:', total + nullCount[0].c);
  
  await conn.end();
}

main().catch(console.error);
