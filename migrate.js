const mysql = require('mysql2/promise');
require('dotenv').config();

// Parse DATABASE_URL or fall back to individual env vars
function getConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    return {
      host: u.hostname,
      port: Number(u.port) || 3306,
      user: u.username,
      password: u.password,
      database: u.pathname.slice(1),
    };
  }
  return {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME,
  };
}

const migrations = [
  {
    name: 'add_Message_deletedAt_editedAt',
    sql: [
      "ALTER TABLE `Message` ADD COLUMN `deletedAt` DATETIME(3) NULL",
      "ALTER TABLE `Message` ADD COLUMN `editedAt` DATETIME(3) NULL",
    ],
  },
  {
    name: 'add_CbtTest_sessionId_termId',
    sql: [
      "ALTER TABLE `CbtTest` ADD COLUMN `sessionId` BIGINT NULL",
      "ALTER TABLE `CbtTest` ADD COLUMN `termId` BIGINT NULL",
      "ALTER TABLE `CbtTest` ADD CONSTRAINT `CbtTest_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `AcademicSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
      "ALTER TABLE `CbtTest` ADD CONSTRAINT `CbtTest_termId_fkey` FOREIGN KEY (`termId`) REFERENCES `AcademicTerm`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
    ],
  },
    sql: [
      "ALTER TABLE `LibraryResource` ADD COLUMN `classRoomId` BIGINT NULL",
      "ALTER TABLE `LibraryResource` ADD CONSTRAINT `LibraryResource_classRoomId_fkey` FOREIGN KEY (`classRoomId`) REFERENCES `ClassRoom`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
    ],
  },
];

async function columnExists(conn, table, column) {
  const [rows] = await conn.query(
    `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows[0].cnt > 0;
}

async function run() {
  const conn = await mysql.createConnection(getConfig());
  try {
    for (const migration of migrations) {
      console.log(`\nRunning: ${migration.name}`);
      for (const sql of migration.sql) {
        try {
          await conn.query(sql);
          console.log(`  ✓ ${sql.slice(0, 60)}...`);
        } catch (err) {
          if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEY' || err.errno === 1060 || err.errno === 1061) {
            console.log(`  ⚠ Already exists, skipping.`);
          } else {
            throw err;
          }
        }
      }
    }
    console.log('\nMigration complete.');
  } finally {
    await conn.end();
  }
}

run().catch(err => { console.error(err.message); process.exit(1); });
