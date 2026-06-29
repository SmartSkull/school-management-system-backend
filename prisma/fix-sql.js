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

  // First, let me check the Result table schema
  const [cols] = await conn.execute('DESCRIBE Result');
  console.log('Result columns:', cols.map(c => c.Field));

  // Check if totalScore column exists
  const hasTotalScore = cols.some(c => c.Field === 'totalScore');
  console.log('Has totalScore:', hasTotalScore);

  // Read the SQL file and modify it
  const sql = fs.readFileSync('florieren-results-second-term.sql', 'utf8');
  
  // Check if it already has createdAt/updatedAt
  if (sql.includes('createdAt')) {
    console.log('SQL already has timestamps');
  } else {
    // Replace column names and add timestamps
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const values = sql.replace(/^INSERT INTO Result \([^)]+\) VALUES/, '')
      .split(/\),\s*\(/)
      .map(v => v.replace(/^\(|\)$/g, ''))
      .map(v => `(${v}, '${now}', '${now}')`);
    
    const modifiedSql = `INSERT INTO Result (studentId, subjectId, sessionId, termId, testScore, examScore, createdAt, updatedAt) VALUES\n${values.join(',\n')};`;
    
    fs.writeFileSync('florieren-results-second-term.sql', modifiedSql);
    console.log('Updated SQL with timestamps');
  }

  await conn.end();
})();