const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function showTableData(tableName, limit = 3) {
  const regex = new RegExp('INSERT INTO `' + tableName + '`.*?VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const match = sql.match(regex);
  if (!match) { console.log(`\n=== ${tableName} (0 rows) ===`); return; }
  
  const values = match[1].trim();
  if (!values) { console.log(`\n=== ${tableName} (0 rows) ===`); return; }
  
  const rows = [];
  const rowRegex = /\(([^)]+)\)/g;
  let m;
  while ((m = rowRegex.exec(values)) !== null) {
    const valuesStr = m[1];
    const vals = [];
    let current = '';
    let inString = false;
    let stringChar = '';
    for (let i = 0; i < valuesStr.length; i++) {
      const ch = valuesStr[i];
      if (inString) {
        if (ch === stringChar && valuesStr[i-1] !== '\\') {
          inString = false;
        }
        current += ch;
      } else {
        if (ch === "'" || ch === '"') {
          inString = true;
          stringChar = ch;
          current += ch;
        } else if (ch === ',') {
          vals.push(current.trim());
          current = '';
        } else {
          current += ch;
        }
      }
    }
    if (current.trim()) vals.push(current.trim());
    rows.push(vals);
  }
  
  // Get columns
  const colRegex = new RegExp('CREATE TABLE `' + tableName + '` \\\\([\\s\\S]*?)\\) ENGINE=');
  const colMatch = sql.match(colRegex);
  const cols = [];
  if (colMatch) {
    const cr = /`([^`]+)`\s+([^,\n]+)/g;
    let cm;
    while ((cm = cr.exec(colMatch[1])) !== null) {
      cols.push(cm[1]);
    }
  }
  
  console.log(`\n=== ${tableName} (${rows.length} rows) ===`);
  if (cols.length) console.log('Columns:', cols.join(', '));
  for (let i = 0; i < Math.min(limit, rows.length); i++) {
    console.log('Row', i+1, ':', rows[i].join(' | '));
  }
  if (rows.length > limit) console.log('... and ' + (rows.length - limit) + ' more rows');
}

showTableData('staff', 3);
showTableData('class', 3);
showTableData('course', 3);
showTableData('class_timetable', 3);
showTableData('library', 3);
showTableData('lesson_note', 3);
showTableData('messsages'); // typo in my script, should be messages
showTableData('messages', 3);
showTableData('post', 3);
showTableData('posts', 3);
showTableData('comment', 3);
showTableData('likes', 3);
showTableData('notification', 3);
showTableData('notifications', 3);
showTableData('payment', 3);
showTableData('scratch_card', 3);
showTableData('school_days', 3);
