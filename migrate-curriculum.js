const mysql = require('mysql2/promise');
require('dotenv').config();

function getConfig() {
  const url = process.env.DATABASE_URL;
  if (url) {
    const u = new URL(url);
    return { host: u.hostname, port: Number(u.port) || 3306, user: u.username, password: u.password, database: u.pathname.slice(1) };
  }
  return { host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT) || 3306, user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'florieren' };
}

async function main() {
  const conn = await mysql.createConnection(getConfig());

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`CurriculumTopic\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`staffId\` BIGINT NOT NULL,
      \`subjectId\` BIGINT NULL,
      \`classRoomId\` BIGINT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`description\` TEXT NULL,
      \`week\` INTEGER NULL,
      \`term\` VARCHAR(20) NULL,
      \`session\` VARCHAR(20) NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`CurriculumTopic_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`CurriculumTopic_subjectId_fkey\` FOREIGN KEY (\`subjectId\`) REFERENCES \`Subject\`(\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`CurriculumTopic_classRoomId_fkey\` FOREIGN KEY (\`classRoomId\`) REFERENCES \`ClassRoom\`(\`id\`) ON DELETE SET NULL
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log('✓ CurriculumTopic');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`LessonPlan\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`staffId\` BIGINT NOT NULL,
      \`topicId\` BIGINT NULL,
      \`subjectId\` BIGINT NULL,
      \`classRoomId\` BIGINT NULL,
      \`title\` VARCHAR(255) NOT NULL,
      \`objectives\` TEXT NULL,
      \`content\` TEXT NULL,
      \`resources\` TEXT NULL,
      \`evaluation\` TEXT NULL,
      \`date\` DATE NULL,
      \`duration\` INTEGER NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      CONSTRAINT \`LessonPlan_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`LessonPlan_topicId_fkey\` FOREIGN KEY (\`topicId\`) REFERENCES \`CurriculumTopic\`(\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`LessonPlan_subjectId_fkey\` FOREIGN KEY (\`subjectId\`) REFERENCES \`Subject\`(\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`LessonPlan_classRoomId_fkey\` FOREIGN KEY (\`classRoomId\`) REFERENCES \`ClassRoom\`(\`id\`) ON DELETE SET NULL
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log('✓ LessonPlan');

  await conn.execute(`
    CREATE TABLE IF NOT EXISTS \`WeeklyScheme\` (
      \`id\` BIGINT NOT NULL AUTO_INCREMENT,
      \`staffId\` BIGINT NOT NULL,
      \`subjectId\` BIGINT NULL,
      \`classRoomId\` BIGINT NULL,
      \`week\` INTEGER NOT NULL,
      \`term\` VARCHAR(20) NOT NULL,
      \`session\` VARCHAR(20) NOT NULL,
      \`content\` TEXT NOT NULL,
      \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      PRIMARY KEY (\`id\`),
      UNIQUE INDEX \`WeeklyScheme_unique\`(\`staffId\`, \`subjectId\`, \`classRoomId\`, \`week\`, \`term\`, \`session\`),
      CONSTRAINT \`WeeklyScheme_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE,
      CONSTRAINT \`WeeklyScheme_subjectId_fkey\` FOREIGN KEY (\`subjectId\`) REFERENCES \`Subject\`(\`id\`) ON DELETE SET NULL,
      CONSTRAINT \`WeeklyScheme_classRoomId_fkey\` FOREIGN KEY (\`classRoomId\`) REFERENCES \`ClassRoom\`(\`id\`) ON DELETE SET NULL
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci
  `);
  console.log('✓ WeeklyScheme');

  await conn.end();
  console.log('Curriculum migration complete.');
}

main().catch(e => { console.error(e); process.exit(1); });
