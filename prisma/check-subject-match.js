const mysql = require('mysql2/promise');
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

  const [subjects] = await conn.execute('SELECT id, name FROM Subject');
  
  const flCourses = ['mathematics', 'diction', 'english-language', 'civic-education', 'agricultural-science', 'lit-in-english', 'basic-science', 'crk', 'ict', 'cca', 'french', 'security-education', 'home-economics', 'history', 'social-studies', 'business-studies', 'phe', 'data-processing'];
  
  console.log('Looking for SQL course matches:');
  for (const c of flCourses) {
    const variants = [
      c,
      c.replace(/-/g, ' '),
      c.replace(/-/g, '')
    ];
    
    const found = subjects.find(s => 
      variants.some(v => s.name.toLowerCase().includes(v))
    );
    
    if (found) {
      console.log(`  "${c}" -> "${found.name}" (id=${found.id})`);
    } else {
      console.log(`  "${c}" -> NOT FOUND`);
    }
  }

  await conn.end();
})();