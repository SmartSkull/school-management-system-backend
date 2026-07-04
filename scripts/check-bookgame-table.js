const mysql = require('mysql2/promise');
(async () => {
  const conn = await mysql.createConnection({
    host: 'yamabiko.proxy.rlwy.net', port: 29012, user: 'root',
    password: 'HCoHqdUXUAPLxfXSJVzFsitxPvQyznMQ', database: 'florieren',
    ssl: { rejectUnauthorized: false }
  });

  // Describe BookGame table to find image/file columns
  try {
    const [cols] = await conn.execute('DESCRIBE BookGame');
    console.log('BookGame columns:', cols.map(c => c.Field).join(', '));
  } catch(e) {
    console.log('No BookGame table:', e.message);
  }

  // Check all tables for the greatkings_2024 pattern
  const tables = ['Book', 'BookGame', 'BookFile', 'File', 'Attachment'];
  for (const t of tables) {
    try {
      const [rows] = await conn.execute(`SELECT * FROM \`${t}\` WHERE 1=0`);
      const [cols] = await conn.execute(`DESCRIBE \`${t}\``);
      console.log(`\n${t} columns:`, cols.map(c => c.Field).join(', '));

      // Look for any column that might store the bookgame filenames
      const fileCols = cols.filter(c =>
        ['file','pdf','image','url','path','attachment','document'].some(k => c.Field.toLowerCase().includes(k))
      );
      for (const col of fileCols) {
        const [rows2] = await conn.execute(
          `SELECT id, \`${col.Field}\` FROM \`${t}\` WHERE \`${col.Field}\` LIKE '%greatkings%' LIMIT 5`
        );
        if (rows2.length > 0) {
          console.log(`  ${t}.${col.Field} has greatkings refs:`, JSON.stringify(rows2));
        }
        // also check non-cloudinary
        const [rows3] = await conn.execute(
          `SELECT id, \`${col.Field}\` FROM \`${t}\` WHERE \`${col.Field}\` IS NOT NULL AND \`${col.Field}\` != '' AND \`${col.Field}\` NOT LIKE '%cloudinary%' LIMIT 5`
        );
        if (rows3.length > 0) {
          console.log(`  ${t}.${col.Field} non-cloudinary sample:`, JSON.stringify(rows3));
        }
      }
    } catch(e) {
      // table doesn't exist
    }
  }

  await conn.end();
})();
