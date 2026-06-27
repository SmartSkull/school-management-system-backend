const mysql = require('mysql2/promise');
const fs = require('fs');

const DB = {
  host: 'yamabiko.proxy.rlwy.net', port: 29012,
  user: 'root', password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren'
};
const SQL_PATH = 'C:/xampp/htdocs/florieren/nestjs-backend/greatkin_gk.sql';

function parseTable(table) {
  const sql = fs.readFileSync(SQL_PATH, 'utf8');
  const pat = new RegExp('INSERT INTO `' + table + '`\\s*\\(([^)]+)\\)\\s*VALUES\\s*([\\s\\S]*?);(?=\\s*--|\\s*INSERT|\\s*CREATE|\\s*$)', 'i');
  const m = sql.match(pat);
  if (!m) return { cols: [], rows: [] };
  const cols = m[1].split(',').map(c => c.trim().replace(/`/g, ''));
  const vb = m[2].trim();
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
      else if (ch === ')' && cur.trim()) { rows.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
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
    if (vals.some(v => v !== '')) out.push(vals);
  }
  return { cols, rows: out };
}

async function main() {
  const conn = await mysql.createConnection(DB);
  const { cols: ac, rows: ar } = parseTable('assignment');
  console.log('Assignment cols:', ac);
  console.log('Assignment rows:', ar.length);
  console.log('First assignment row:', ar[0] ? ar[0].slice(0, 5) : 'none');

  const [attc, attr] = parseTable('attendance');
  console.log('Attendance cols:', attc);
  console.log('Attendance rows:', attr.length);
  console.log('First attendance row:', attr[0] ? attr[0].slice(0, 5) : 'none');

  const [rc, rr] = parseTable('result');
  console.log('Result cols:', rc);
  console.log('Result rows:', rr.length);
  console.log('First result row:', rr[0] ? rr[0].slice(0, 5) : 'none');

  const [pc, pr] = parseTable('post');
  console.log('Post cols:', pc);
  console.log('Post rows:', pr.length);
  console.log('First post row:', pr[0] ? pr[0].slice(0, 3) : 'none');

  const [cc, cr] = parseTable('comment');
  console.log('Comment cols:', cc);
  console.log('Comment rows:', cr.length);
  console.log('First comment row:', cr[0] ? cr[0].slice(0, 3) : 'none');

  const [lc, lr] = parseTable('likes');
  console.log('Likes cols:', lc);
  console.log('Likes rows:', lr.length);
  console.log('First likes row:', lr[0] ? lr[0].slice(0, 3) : 'none');

  await conn.end();
}
main().catch(e => console.error(e));
