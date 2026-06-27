const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function extractTable(tableName) {
  const regex = new RegExp('INSERT INTO `' + tableName + '` .*?VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)');
  const match = sql.match(regex);
  if (!match) return [];
  const values = match[1].trim();
  if (!values) return [];
  const rows = [];
  // Parse each row
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
  return rows;
}

function getTableColumns(tableName) {
  const regex = new RegExp('CREATE TABLE `' + tableName + '` \\\\([\\s\\S]*?)\\) ENGINE=');
  const match = sql.match(regex);
  if (!match) return [];
  const cols = [];
  const colRegex = /`([^`]+)`\s+([^,\n]+)/g;
  let m;
  while ((m = colRegex.exec(match[1])) !== null) {
    if (m[1] === 'ENGINE' || m[1] === 'DEFAULT' || m[1].startsWith('KEY')) continue;
    const typeMatch = m[2].match(/^([^\s(]+)/);
    cols.push({ name: m[1], type: typeMatch ? typeMatch[1] : m[2] });
  }
  return cols;
}

function showTable(tableName, limit = 5) {
  const cols = getTableColumns(tableName);
  const rows = extractTable(tableName);
  console.log(`\n=== ${tableName} (${rows.length} rows) ===`);
  if (cols.length) console.log('Columns:', cols.map(c => c.name).join(', '));
  for (let i = 0; i < Math.min(limit, rows.length); i++) {
    console.log('Row', i+1, ':', rows[i].join(' | '));
  }
  if (rows.length > limit) console.log('... and ' + (rows.length - limit) + ' more rows');
}

showTable('result', 3);
showTable('cbt', 3);
showTable('cbt_session', 3);
showTable('cbt_result', 3);
showTable('student_answer', 3);
showTable('student', 3);
showTable('users', 3);
showTable('manage_fees_tbl', 3);
showTable('manage_school_fees', 3);
showTable('payment', 3);
showTable('scratch_card', 3);
showTable('course', 5);
showTable('session', 5);
showTable('term', 5);
showTable('set_session_tbl', 5);
showTable('set_term_tbl', 5);
