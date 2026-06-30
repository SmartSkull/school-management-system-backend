const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');

const result = dotenv.config({ path: path.join(__dirname, '.env') });
if (result.error) {
  console.error('Failed to load .env:', result.error);
}

function calculateGrade(total) {
  if (total >= 75) return 'A1';
  if (total >= 70) return 'B2';
  if (total >= 65) return 'B3';
  if (total >= 60) return 'C4';
  if (total >= 55) return 'C5';
  if (total >= 50) return 'C6';
  if (total >= 45) return 'D7';
  if (total >= 40) return 'E8';
  return 'F9';
}

function calculateRemark(grade) {
  if (!grade) return '';
  if (grade === 'A1' || grade === 'A+') return 'Excellent';
  if (grade === 'A' || grade === 'B2') return 'Very Good';
  if (grade === 'B3' || grade === 'B' || grade === 'C4') return 'Good';
  if (grade === 'C5' || grade === 'C6' || grade === 'C') return 'Average';
  if (grade === 'D7' || grade === 'D') return 'Below Avg.';
  if (grade === 'E8' || grade === 'E' || grade === 'F9' || grade === 'F') return 'Weak';
  return '';
}

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 15000
  });

  console.log('Connected to Railway DB:', process.env.DB_NAME);

  // Fix totalScore mismatches first
  console.log('\n--- Fixing mismatched totalScore ---');
  const [totalMismatch] = await conn.execute(`
    SELECT COUNT(*) as cnt FROM Result
    WHERE ROUND(testScore + examScore, 2) != ROUND(totalScore, 2)
  `);
  console.log(`Rows with wrong totalScore: ${totalMismatch[0].cnt}`);

  if (totalMismatch[0].cnt > 0) {
    const [updateTotal] = await conn.execute(`
      UPDATE Result
      SET totalScore = ROUND(testScore + examScore, 2)
      WHERE ROUND(testScore + examScore, 2) != ROUND(totalScore, 2)
    `);
    console.log(`Fixed ${updateTotal.affectedRows} totalScore values`);
  }

  // Recalculate grades and remarks for ALL rows where they don't match the current totalScore
  console.log('\n--- Recalculating grades and remarks ---');
  const [allResults] = await conn.execute('SELECT id, totalScore, grade, remark FROM Result');
  let updated = 0;
  const updates = [];

  for (const row of allResults) {
    const total = parseFloat(row.totalScore) || 0;
    const expectedGrade = calculateGrade(total);
    const expectedRemark = calculateRemark(expectedGrade);

    if (row.grade !== expectedGrade || row.remark !== expectedRemark) {
      updates.push({ id: row.id, grade: expectedGrade, remark: expectedRemark });
    }
  }

  console.log(`Rows needing grade/remark update: ${updates.length}`);

  const chunkSize = 1000;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    const gradeCases = [];
    const remarkCases = [];
    const ids = [];

    for (const u of chunk) {
      gradeCases.push(`WHEN id = ${u.id} THEN '${u.grade}'`);
      remarkCases.push(`WHEN id = ${u.id} THEN '${u.remark}'`);
      ids.push(u.id.toString());
    }

    const sql = `
      UPDATE Result 
      SET grade = CASE ${gradeCases.join(' ')} ELSE grade END,
          remark = CASE ${remarkCases.join(' ')} ELSE remark END
      WHERE id IN (${ids.join(',')})
    `;

    const [res] = await conn.execute(sql);
    updated += res.affectedRows;

    if ((i + chunk.length) % 5000 === 0 || i + chunk.length >= updates.length) {
      console.log(`  Processed ${Math.min(i + chunk.length, updates.length)} / ${updates.length} rows...`);
    }
  }
  console.log(`Updated ${updated} rows`);

  // Final verification
  console.log('\n--- Final verification ---');
  const [finalStats] = await conn.execute(`
    SELECT 
      COUNT(*) as total,
      SUM(CASE WHEN grade IS NULL OR grade = '' THEN 1 ELSE 0 END) as empty_grade,
      SUM(CASE WHEN remark IS NULL OR remark = '' THEN 1 ELSE 0 END) as empty_remark,
      SUM(CASE WHEN ROUND(testScore + examScore, 2) != ROUND(totalScore, 2) THEN 1 ELSE 0 END) as wrong_total
    FROM Result
  `);
  const f = finalStats[0];
  console.log(`Total results: ${f.total}`);
  console.log(`Empty grades: ${f.empty_grade}`);
  console.log(`Empty remarks: ${f.empty_remark}`);
  console.log(`Wrong totalScore: ${f.wrong_total}`);

  // Grade distribution
  console.log('\n--- Grade distribution ---');
  const [grades] = await conn.execute(`
    SELECT grade, COUNT(*) as cnt FROM Result GROUP BY grade ORDER BY grade
  `);
  for (const g of grades) {
    console.log(`${g.grade || '(empty)'}: ${g.cnt}`);
  }

  await conn.end();
  console.log('\nDone!');
}

run().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
