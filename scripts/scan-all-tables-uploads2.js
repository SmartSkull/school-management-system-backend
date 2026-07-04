/**
 * Scan ALL tables in the DB for columns that contain the bookgame filenames
 * from uploads2/bookgame/ or any other uploads2-only files.
 */
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const UPLOADS2 = path.join(__dirname, '..', 'uploads2');

function listAllFiles(dir, base = '') {
  const result = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel  = base ? `${base}/${entry}` : entry;
    if (fs.statSync(full).isDirectory()) result.push(...listAllFiles(full, rel));
    else result.push(rel);
  }
  return result;
}

(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren',
    ssl: { rejectUnauthorized: false }
  });

  const uploads2Files = listAllFiles(UPLOADS2);
  const basenames = uploads2Files.map(f => path.basename(f));
  console.log('uploads2 files:', uploads2Files.length);

  // All tables
  const [tableRows] = await conn.execute('SHOW TABLES');
  const tables = tableRows.map(r => Object.values(r)[0]);

  for (const table of tables) {
    const [cols] = await conn.execute(`DESCRIBE \`${table}\``);
    // Only string-type columns that could hold file paths
    const stringCols = cols.filter(c =>
      ['varchar','text','longtext','mediumtext'].some(t => c.Type.toLowerCase().includes(t))
    );

    for (const col of stringCols) {
      // Search for any uploads2 basename in this column
      for (const basename of basenames) {
        try {
          const [rows] = await conn.execute(
            `SELECT id, \`${col.Field}\` FROM \`${table}\` WHERE \`${col.Field}\` LIKE ? LIMIT 3`,
            [`%${basename}%`]
          );
          if (rows.length > 0) {
            console.log(`\n✓ ${table}.${col.Field} references "${basename}":`);
            rows.forEach(r => console.log(`  #${r.id}: ${r[col.Field]}`));
          }
        } catch(e) { /* skip */ }
      }
    }
  }

  await conn.end();
  console.log('\nScan complete.');
})();
