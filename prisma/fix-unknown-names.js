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
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  // Find users with Unknown names
  const [unknownUsers] = await conn.execute(
    "SELECT uniqueId, id FROM User WHERE firstName = 'Unknown' OR lastName = 'Unknown'"
  );

  console.log(`Found ${unknownUsers.length} users with Unknown names`);

  // Parse GKA SQL to get real data
  const gkSql = fs.readFileSync('greatkin_gk.sql', 'utf8');
  
  const gkUsers = new Map();
  const lines = gkSql.split('\n').filter(l => l.trim().startsWith('(') && l.includes("'greatkings/"));

  for (const line of lines) {
    const parts = [];
    let current = '';
    let inQuote = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === "'") inQuote = !inQuote;
      else if (char === ',' && !inQuote) {
        parts.push(current.trim().replace(/^'|'$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    if (current) parts.push(current.trim().replace(/^'|'$/g, ''));

    if (parts.length >= 12) {
      const studentId = parts[1];
      gkUsers.set(studentId, {
        firstname: parts[2] || '',
        lastname: parts[3] || '',
        email: parts[8] || '',
        telephone: parts[9] || ''
      });
    }
  }

  // Update users
  let updated = 0;
  for (const u of unknownUsers) {
    const data = gkUsers.get(u.uniqueId);
    if (data && data.firstname) {
      await conn.execute(
        'UPDATE User SET firstName = ?, lastName = ?, email = ?, telephone = ? WHERE id = ?',
        [data.firstname.substring(0, 100), data.lastname.substring(0, 100), data.email, data.telephone, u.id]
      );
      updated++;
    }
  }

  console.log(`Updated ${updated} users`);

  // Verify
  const [check] = await conn.execute(
    "SELECT uniqueId, firstName, lastName, email FROM User WHERE firstName = 'Unknown' OR lastName = 'Unknown' LIMIT 5"
  );
  console.log('Remaining Unknown users:', check.length);

  await conn.end();
})();