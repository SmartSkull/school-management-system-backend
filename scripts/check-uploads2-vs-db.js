/**
 * Cross-check uploads2 files against the DB.
 * Find any DB records that still have a bare filename matching a file in uploads2
 * (meaning uploads2 has the file but it wasn't in uploads/ so wasn't migrated yet).
 */
const mysql = require('mysql2/promise');
const fs    = require('fs');
const path  = require('path');

const UPLOADS2 = path.join(__dirname, '..', 'uploads2');
const UPLOADS1 = path.join(__dirname, '..', 'uploads');

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

  // Build a set of all filenames in uploads2 (basename only and relative path)
  const uploads2Files = listAllFiles(UPLOADS2);
  const uploads2Basenames = new Set(uploads2Files.map(f => path.basename(f)));
  const uploads2RelSet = new Set(uploads2Files);
  console.log(`uploads2 has ${uploads2Files.length} files`);

  // Build same set for uploads1 — files only in uploads2 (not in uploads1)
  const uploads1Files = new Set(listAllFiles(UPLOADS1).map(f => path.basename(f)));
  const onlyInUploads2 = uploads2Files.filter(f => !uploads1Files.has(path.basename(f)));
  console.log(`Files only in uploads2 (not in uploads1): ${onlyInUploads2.length}`);
  if (onlyInUploads2.length > 0) {
    console.log('Sample unique files:', onlyInUploads2.slice(0, 10));
  }

  // Check all tables for records still pointing to bare filenames that match uploads2
  const TABLES = [
    { table: 'User',    idCol: 'id', imageCol: 'image',       schoolFilter: '' },
    { table: 'Student', idCol: 'id', imageCol: 'parentImage', schoolFilter: '' },
    { table: 'Post',    idCol: 'id', imageCol: 'image',        schoolFilter: '' },
  ];

  for (const { table, idCol, imageCol } of TABLES) {
    const [rows] = await conn.execute(
      `SELECT ${idCol}, \`${imageCol}\` FROM \`${table}\`
       WHERE \`${imageCol}\` IS NOT NULL AND \`${imageCol}\` != ''
         AND \`${imageCol}\` NOT LIKE '%cloudinary.com%'
         AND \`${imageCol}\` NOT LIKE '%@%'
         AND \`${imageCol}\` NOT LIKE '%http%'`
    );

    const needsMigration = rows.filter(r => {
      const val = r[imageCol];
      const basename = path.basename(val);
      return uploads2Basenames.has(basename) && !uploads1Files.has(basename);
    });

    console.log(`\n${table}.${imageCol}: ${rows.length} unmigrated rows, ${needsMigration.length} match uploads2-only files`);
    if (needsMigration.length > 0) {
      console.log('  Samples:', needsMigration.slice(0, 5).map(r => `#${r[idCol]} → ${r[imageCol]}`));
    }
  }

  await conn.end();
})();
