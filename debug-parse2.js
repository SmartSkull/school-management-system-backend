const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function parseSqlRows(tableName) {
  const headerRegex = new RegExp('INSERT INTO `' + tableName + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*', 'i');
  const headerMatch = sql.match(headerRegex);
  if (!headerMatch) return { cols: headerMatch ? headerMatch[1].split(',').map(c => c.trim().replace(/`/g, '')) : [], rows: [] };
  
  const cols = headerMatch[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const startIdx = headerMatch.index + headerMatch[0].length;
  
  // Find the semicolon that ends this INSERT block
  const blockEnd = sql.indexOf(';', startIdx);
  if (blockEnd === -1) return { cols, rows: [] };
  
  const valuesBlock = sql.substring(startIdx, blockEnd);
  
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
        if (cur.trim()) cur = ''; // ignore whitespace
      }
      else if (ch === ')' && cur.trim()) {
        rows.push(cur.trim());
        cur = '';
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

const { cols: staffCols, rows: staffRows } = parseSqlRows('staff');
console.log('Staff cols:', staffCols.join(', '));
console.log('Staff rows:', staffRows.length);
console.log('First staff unique_id:', staffRows[0][staffCols.indexOf('unique_id')]);

const { cols: userCols, rows: userRows } = parseSqlRows('users');
console.log('\nUsers cols:', userCols.join(', '));
console.log('Users rows:', userRows.length);
console.log('First user student_id:', userRows[0][userCols.indexOf('student_id')]);

const { cols: adminCols, rows: adminRows } = parseSqlRows('admin');
console.log('\nAdmin cols:', adminCols.join(', '));
console.log('Admin rows:', adminRows.length);
console.log('First admin unique_id:', adminRows[0][adminCols.indexOf('unique_id')]);

const { cols: resultCols, rows: resultRows } = parseSqlRows('result');
console.log('\nResult cols:', resultCols.join(', '));
console.log('Result rows:', resultRows.length);
console.log('First result teacher_id:', resultRows[0][resultCols.indexOf('teacher_id')]);
