/**
 * Shows all tables and row counts in the Railway DB,
 * alongside the key counts from the source SQL files for manual comparison.
 */
require('dotenv').config();
const mysql = require('mysql2/promise');

// Key data points from the two SQL files (old schema names → counts)
const SQL_SUMMARY = {
  'users (students+staff+admins)': 521,
  'result (exam results)': 26020,
  'attendance': 2022,
  'notification': 28344,
  'test (CBT questions)': 611,
  'cbt_result': 34,
  'messages': 150,
  'post/posts': 14,
  'comment': 35,
  'likes': 189,
  'library': 7,
  'video': 4,
  'scratch_card': 19,
  'student_answer': 49,
  'course (subjects)': 81,
  'class': 22,
  'staff': 37,
};

async function main() {
  const url = process.env.DATABASE_URL;
  const m = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/(.+)/);
  const [, user, password, host, port, database] = m;

  const conn = await mysql.createConnection({
    host, port: parseInt(port), user, password, database,
    ssl: { rejectUnauthorized: false }
  });

  // Get all tables
  const [tableRows] = await conn.query('SHOW TABLES');
  const tables = tableRows.map(r => Object.values(r)[0]);

  console.log('\n' + '='.repeat(60));
  console.log('  RAILWAY DB — ALL TABLES & ROW COUNTS');
  console.log('='.repeat(60));

  const dbCounts = {};
  for (const table of tables.sort()) {
    const [[{ cnt }]] = await conn.query(`SELECT COUNT(*) as cnt FROM \`${table}\``);
    dbCounts[table] = Number(cnt);
    const indicator = cnt > 0 ? '✓' : '○';
    console.log(`  ${indicator} ${table.padEnd(40)} ${String(cnt).padStart(8)} rows`);
  }

  await conn.end();

  console.log('='.repeat(60));
  console.log(`  Total tables: ${tables.length}`);
  console.log(`  Non-empty:    ${Object.values(dbCounts).filter(c => c > 0).length}`);
  console.log(`  Empty:        ${Object.values(dbCounts).filter(c => c === 0).length}`);

  console.log('\n' + '='.repeat(60));
  console.log('  SOURCE SQL FILES — KEY COUNTS (old schema)');
  console.log('='.repeat(60));
  for (const [label, count] of Object.entries(SQL_SUMMARY)) {
    console.log(`  ${label.padEnd(40)} ${String(count).padStart(8)} rows`);
  }
  console.log('');
  console.log('  NOTE: The SQL files use old table names. The Railway DB uses');
  console.log('  the new Prisma schema names (e.g. User, Student, Staff, etc.)');
  console.log('  Compare semantically — e.g. SQL "users"=521 vs DB "User" count.');
  console.log('');
}

main().catch(e => { console.error(e.message); process.exit(1); });
