const mysql = require('mysql2/promise');
const fs = require('fs');
const dotenv = require('dotenv');

dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  // Get users still with Unknown names
  const [unknown] = await conn.execute(
    "SELECT uniqueId, firstName, lastName FROM User WHERE firstName = 'Unknown' OR lastName = 'Unknown'"
  );

  // Parse SQL files to find their data
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  const flSql = fs.readFileSync('greatkin_florieren.sql', 'utf8');

  console.log('Users still with Unknown names:', unknown.length);
  
  for (const u of unknown) {
    // Search in both SQL files
    const gkLines = gkSql.split('\n').filter(l => l.includes(`'${u.uniqueId}'`));
    const flLines = flSql.split('\n').filter(l => l.includes(`'${u.uniqueId}'`));
    
    const allLines = [...gkLines, ...flLines];
    if (allLines.length > 0) {
      const parts = allLines[0].split(',');
      console.log(`${u.uniqueId}: Line found, parts[2]="${parts[2]?.replace(/'/g, '')}", parts[3]="${parts[3]?.replace(/'/g, '')}"`);
    } else {
      console.log(`${u.uniqueId}: NOT FOUND in SQL files`);
    }
  }

  await conn.end();
})();