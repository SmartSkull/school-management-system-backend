const fs = require('fs');
const SQL_PATH = 'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql';

function parseTable(table) {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const pat = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const m = sql.match(pat);
  console.log('Match for', table, ':', m ? 'YES' : 'NO');
  if (!m) return { cols: [], rows: [] };
  const cols = m[1].split(',').map(c => c.trim().replace(/`/g, ''));
  console.log('Cols:', cols);
  const vb = m[2].trim();
  console.log('VB length:', vb.length);
  const rows = [];
  let cur = '', ins = false, sc = "'";
  for (let i = 0; i < vb.length; i++) {
    const ch = vb[i];
    if (ins) {
      if (ch === sc && cur[cur.length - 1] === '\\') cur = cur.slice(0, -1) + ch;
      else { cur += ch; if (ch === sc) ins = false; }
    } else {
      if (ch === "'" || ch === '"') { ins = true; sc = ch; cur = ch; }
      else if (ch === '(') cur = '';
      else if (ch === ')' && cur.trim()) { rows.push(cur.trim()); }
      else cur += ch;
    }
  }
  console.log('Raw rows:', rows.length);
  if (rows.length > 0) {
    console.log('First raw row sample:', JSON.stringify(rows[0].substring(0, 50)));
  }
  
  const out = [];
  for (const rs of rows) {
    const vals = [];
    let r = '', ri = false, rc = "'";
    for (let i = 0; i < rs.length; i++) {
      const ch = rs[i];
      if (ri) {
        if (ch === rc && r[r.length - 1] === '\\') r = r.slice(0, -1) + ch;
        else { r += ch; if (ch === rc) ri = false; }
      } else {
        if (ch === "'" || ch === '"') { ri = true; rc = ch; r = ch; }
        else if (ch === ',') { vals.push(r.trim().replace(/^['"]|['"]$/g, '')); r = ''; }
        else r += ch;
      }
    }
    const last = r.trim().replace(/^['"]|['"]$/g, '');
    if (last !== '') vals.push(last);
    while (vals.length < cols.length) vals.push('');
    if (vals.length > cols.length) vals = vals.slice(0, cols.length - 1).concat([vals.slice(cols.length - 1).join(',')]);
    if (vals.some(v => v !== '')) {
      out.push(vals);
    }
  }
  console.log('Filtered rows:', out.length);
  if (out.length > 0) {
    console.log('First filtered row:', out[0].slice(0, 5));
  }
  return { cols, rows: out };
}

parseTable('assignment');
parseTable('attendance');
parseTable('result');
parseTable('post');
