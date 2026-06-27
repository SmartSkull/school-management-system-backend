const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function parseSqlRows(sql, tableName) {
  // Find INSERT INTO statement
  const regex = new RegExp('INSERT INTO `' + tableName + '`\\s*\\(([^)]+)\\)\\s*VALUES', 'i');
  const match = sql.match(regex);
  if (!match) return { cols: [], rows: [] };
  
  const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
  
  // Find VALUES block - it might span multiple INSERT statements
  // Actually, let's find the first VALUES block after the header
  const valuesIdx = sql.indexOf('VALUES', match.index + match[0].length);
  if (valuesIdx === -1) return { cols, rows: [] };
  
  const valuesBlock = sql.substring(valuesIdx + 6);
  
  const rows = [];
  let cur = '', inStr = false, sc = '';
  for (let i = 0; i < valuesBlock.length; i++) {
    const ch = valuesBlock[i];
    if (inStr) {
      if (ch === sc && valuesBlock[i-1] !== '\\') inStr = false;
      cur += ch;
    } else {
      if (ch === "'" || ch === '"') { inStr = true; sc = ch; cur += ch; }
      else if (ch === '(') {
        if (cur.trim()) rows.push(cur.trim());
        cur = '';
      }
      else if (ch === ')' && cur.trim()) {
        cur += ch;
        rows.push(cur.trim());
        cur = '';
      }
      else if (ch === ';' && cur.trim() === '') {
        break;
      }
      else cur += ch;
    }
  }
  
  const parsedRows = [];
  for (const rowStr of rows) {
    const vals = [];
    let rCur = '', rInStr = false, rSc = '';
    for (let i = 0; i < rowStr.length; i++) {
      const ch = rowStr[i];
      if (rInStr) {
        if (ch === rSc && rowStr[i-1] !== '\\') rInStr = false;
        rCur += ch;
      } else {
        if (ch === "'" || ch === '"') { rInStr = true; rSc = ch; rCur += ch; }
        else if (ch === ',') { vals.push(rCur.trim()); rCur = ''; }
        else rCur += ch;
      }
    }
    if (rCur.trim()) vals.push(rCur.trim());
    if (vals.length > 0) parsedRows.push(vals);
  }
  
  return { cols, rows: parsedRows };
}

function getSrc(sql, tableName) {
  return parseSqlRows(sql, tableName);
}

const { cols: staffCols, rows: staffRows } = getSrc(sql, 'staff');
console.log('Staff cols:', staffCols.join(', '));
console.log('Staff rows:', staffRows.length);
console.log('First staff row:', staffRows[0].join(', '));
console.log('First staff unique_id:', staffRows[0][staffCols.indexOf('unique_id')]);

const { cols: userCols, rows: userRows } = getSrc(sql, 'users');
console.log('\nUsers cols:', userCols.join(', '));
console.log('Users rows:', userRows.length);
console.log('First user id:', userRows[0][userCols.indexOf('student_id')]);

const { cols: adminCols, rows: adminRows } = getSrc(sql, 'admin');
console.log('\nAdmin cols:', adminCols.join(', '));
console.log('Admin rows:', adminRows.length);
console.log('First admin unique_id:', adminRows[0][adminCols.indexOf('unique_id')]);
