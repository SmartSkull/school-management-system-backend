const fs = require('fs');
const sql = fs.readFileSync('C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql', 'utf8');

function unquote(v) {
  if (!v) return null;
  v = v.trim();
  if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
    return v.slice(1, -1);
  }
  if (v.toLowerCase() === 'null') return null;
  return v;
}

function parseSqlRows(tableName) {
  const regex = new RegExp('INSERT INTO `' + tableName + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const match = sql.match(regex);
  if (!match) return { cols: [], rows: [] };
  const cols = match[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const valuesBlock = match[2].trim();
  if (!valuesBlock) return { cols, rows: [] };
  const rows = [];
  let cur = '', inStr = false, sc = '';
  for (let i = 0; i < valuesBlock.length; i++) {
    const ch = valuesBlock[i];
    if (inStr) {
      if (ch === sc && valuesBlock[i-1] !== '\\') inStr = false;
      cur += ch;
    } else {
      if (ch === "'" || ch === '"') { inStr = true; sc = ch; cur += ch; }
      else if (ch === '(') { cur = ''; }
      else if (ch === ')' && cur.trim()) { rows.push(cur.trim()); cur = ''; }
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
        else if (ch === ',') { vals.push(unquote(rCur)); rCur = ''; }
        else rCur += ch;
      }
    }
    if (rCur.trim()) vals.push(unquote(rCur));
    if (vals.length > 0) parsedRows.push(vals);
  }
  return { cols, rows: parsedRows };
}

// Test
const { cols, rows } = parseSqlRows('staff');
console.log('Staff cols:', cols.join(', '));
console.log('Staff rows:', rows.length);
console.log('Row1 unique_id:', rows[0][cols.indexOf('unique_id')], 'dob:', rows[0][cols.indexOf('date_of_birth')]);
