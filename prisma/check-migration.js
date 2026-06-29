const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const fs = require('fs');

dotenv.config();

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME
  });

  const [users] = await conn.execute('SELECT COUNT(*) as c FROM User WHERE role = ?', ['STUDENT']);
  const [students] = await conn.execute('SELECT COUNT(*) as c FROM Student');
  
  console.log('Current DB State:');
  console.log(' Student Users:', users[0].c);
  console.log(' Student Records:', students[0].c);
  
  const gkUsers = JSON.parse(fs.readFileSync('gka-users.json', 'utf8'));
  const flUsers = JSON.parse(fs.readFileSync('florieren-users.json', 'utf8'));
  
  console.log('\nSQL Files Contain:');
  console.log(' GKA students:', gkUsers.length);
  console.log(' Florieren students:', flUsers.length);
  console.log(' Total expected:', gkUsers.length + flUsers.length);
  
  console.log('\nMissing students:', (gkUsers.length + flUsers.length) - students[0].c);

  await conn.end();
})();