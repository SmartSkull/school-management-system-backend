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

function extractInserts(tableName) {
  const regex = new RegExp(`INSERT INTO \`${tableName}\`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]+?);`, 'i');
  const match = sql.match(regex);
  if (!match) return [];
  
  const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const valuesBlock = match[2];
  const rows = [];
  const rowRegex = /\(([^)]+)\)(?:,\s*)?/g;
  let rowMatch;
  
  while ((rowMatch = rowRegex.exec(valuesBlock)) !== null) {
    const values = parseSqlRow(rowMatch[1]);
    const row = {};
    cols.forEach((col, idx) => {
      row[col] = values[idx] !== undefined ? values[idx] : null;
    });
    rows.push(row);
  }
  
  return rows;
}

async function main() {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012,
    user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
  });
  
  const [school8] = await conn.execute("SELECT id FROM School WHERE slug = 'florieren-1'");
  const schoolId = school8[0].id;
  
  // Get all florieren users
  const [users] = await conn.execute(`
    SELECT u.uniqueId, u.id as userId, s.id as studentId
    FROM User u 
    LEFT JOIN Student s ON s.userId = u.id 
    WHERE u.schoolId = ?
  `, [schoolId]);
  
  const userMap = {};
  users.forEach(u => {
    userMap[u.uniqueId] = { userId: u.userId, studentId: u.studentId };
  });
  
  // Get staff
  const [staff] = await conn.execute(`
    SELECT u.uniqueId, s.id as staffId
    FROM Staff s JOIN User u ON u.id = s.userId 
    WHERE u.schoolId = ?
  `, [schoolId]);
  const staffMap = {};
  staff.forEach(s => staffMap[s.uniqueId] = s.staffId);
  
  // Check what's in DB for florieren
  const [dbResults] = await conn.execute(`
    SELECT COUNT(*) as c FROM Result r
    JOIN Student s ON s.id = r.studentId
    JOIN User u ON u.id = s.userId
    WHERE u.schoolId = ?
  `, [schoolId]);
  
  const [dbScratch] = await conn.execute('SELECT COUNT(*) as c FROM ScratchCard');
  const [dbCbtQ] = await conn.execute('SELECT COUNT(*) as c FROM CbtQuestion');
  const [dbCbtR] = await conn.execute('SELECT COUNT(*) as c FROM CbtResult');
  const [dbAtt] = await conn.execute(`
    SELECT COUNT(*) as c FROM Attendance a
    JOIN Student s ON s.id = a.studentId
    JOIN User u ON u.id = s.userId
    WHERE u.schoolId = ?
  `, [schoolId]);
  const [dbNotif] = await conn.execute(`
    SELECT COUNT(*) as c FROM Notification n
    JOIN User u ON u.id = n.userId
    WHERE u.schoolId = ?
  `, [schoolId]);
  
  console.log('=== Database counts for school 8 (florieren) ===');
  console.log('Results:', dbResults[0].c);
  console.log('ScratchCards:', dbScratch[0].c);
  console.log('CbtQuestions:', dbCbtQ[0].c);
  console.log('CbtResults:', dbCbtR[0].c);
  console.log('Attendance:', dbAtt[0].c);
  console.log('Notifications:', dbNotif[0].c);
  
  // Now check what needs migration from SQL
  console.log('\n=== What needs migration from SQL ===');
  
  const sqlResults = extractInserts('result');
  const fpisResults = sqlResults.filter(r => {
    const sid = r.student_id || r.user_id;
    return sid && (sid.startsWith('fpis/') || userMap[sid]);
  });
  console.log('Results in SQL for florieren:', fpisResults.length);
  
  const sqlScratch = extractInserts('scratch_card');
  const fpisScratch = sqlScratch.filter(r => r.student_id && r.student_id.startsWith('fpis/'));
  console.log('Scratch cards in SQL for florieren:', fpisScratch.length);
  
  const sqlCbt = extractInserts('test');
  console.log('CBT questions in SQL for florieren:', sqlCbt.length);
  
  const sqlCbtR = extractInserts('cbt_result');
  const fpisCbtR = sqlCbtR.filter(r => r.student_id && r.student_id.startsWith('fpis/'));
  console.log('CBT results in SQL for florieren:', fpisCbtR.length);
  
  const sqlAtt = extractInserts('attendance');
  const fpisAtt = sqlAtt.filter(r => {
    const sid = r.student_id || r.user_id;
    return sid && (sid.startsWith('fpis/') || userMap[sid]);
  });
  console.log('Attendance in SQL for florieren:', fpisAtt.length);
  
  const sqlNotif = extractInserts('notification');
  const fpisNotif = sqlNotif.filter(r => {
    const uid = r.user_id || r.userId;
    return uid && (uid.startsWith('fpis/') || userMap[uid]);
  });
  console.log('Notifications in SQL for florieren:', fpisNotif.length);
  
  await conn.end();
}

main().catch(console.error);
