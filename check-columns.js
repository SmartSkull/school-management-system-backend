require('dotenv').config();
const mysql = require('mysql2/promise');

async function main() {
  const url = new URL(process.env.DATABASE_URL);
  const conn = await mysql.createConnection({
    host: url.hostname,
    port: parseInt(url.port),
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },
  });

  // Simulate a createQuestion INSERT with all fields to see if it errors
  try {
    const [r] = await conn.execute(
      `INSERT INTO \`CbtQuestion\` 
        (testId, staffId, subjectId, question, optionA, optionB, optionC, optionD, answer, sectionLabel, sectionOrder, createdAt, updatedAt)
       VALUES (1, NULL, NULL, 'Test question', 'Option A', 'Option B', NULL, NULL, 'A', NULL, 0, NOW(3), NOW(3))`
    );
    console.log('INSERT succeeded, insertId:', r.insertId);
    // clean up
    await conn.execute('DELETE FROM `CbtQuestion` WHERE id = ?', [r.insertId]);
    console.log('Cleanup done');
  } catch(e) {
    console.error('INSERT failed:', e.message);
  }

  await conn.end();
}
main().catch(e => console.error(e.message));
