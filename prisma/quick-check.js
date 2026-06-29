const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
dotenv.config();

async function quickCheck() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST, port: +process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME
  });

  const [students] = await conn.execute('SELECT studentNo, schoolId FROM Student WHERE studentNo LIKE "greatkings/%" OR studentNo LIKE "fpis/%" LIMIT 10');
  console.log('Sample studentNos:');
  students.forEach(s => console.log(s.studentNo, 'school:', s.schoolId));

  const [sessions] = await conn.execute('SELECT id, name, schoolId FROM AcademicSession');
  console.log('\nSessions:');
  sessions.forEach(s => console.log(s.id, s.name, 'school:', s.schoolId));

  const [terms] = await conn.execute('SELECT id, name, sessionId FROM AcademicTerm');
  console.log('\nTerms:', terms.length);
  terms.slice(0, 10).forEach(t => console.log(t.id, t.name, 'session:', t.sessionId));

  await conn.end();
}
quickCheck().catch(console.error);