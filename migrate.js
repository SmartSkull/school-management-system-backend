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
  {
    name: 'add_LibraryResource_classRoomId',
    sql: [
      "ALTER TABLE `LibraryResource` ADD COLUMN `classRoomId` BIGINT NULL",
      "ALTER TABLE `LibraryResource` ADD CONSTRAINT `LibraryResource_classRoomId_fkey` FOREIGN KEY (`classRoomId`) REFERENCES `ClassRoom`(`id`) ON DELETE SET NULL ON UPDATE CASCADE",
    ],
  },
  {
    name: 'add_staff_attendance',
    sql: [
      `CREATE TABLE IF NOT EXISTS \`AttendanceLocation\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`schoolId\` BIGINT NOT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`latitude\` DOUBLE NOT NULL,
        \`longitude\` DOUBLE NOT NULL,
        \`radiusMeters\` INT NOT NULL DEFAULT 100,
        \`resumptionTime\` VARCHAR(5) NOT NULL DEFAULT '08:00',
        \`isActive\` BOOLEAN NOT NULL DEFAULT TRUE,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL,
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`AttendanceLocation_schoolId_fkey\` FOREIGN KEY (\`schoolId\`) REFERENCES \`School\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS \`StaffAttendance\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`staffId\` BIGINT NOT NULL,
        \`locationId\` BIGINT NULL,
        \`date\` DATE NOT NULL,
        \`clockIn\` DATETIME(3) NULL,
        \`clockOut\` DATETIME(3) NULL,
        \`status\` ENUM('PRESENT','ABSENT','LATE') NOT NULL DEFAULT 'PRESENT',
        \`lateMinutes\` INT NOT NULL DEFAULT 0,
        \`note\` VARCHAR(255) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`StaffAttendance_staffId_date_key\` (\`staffId\`, \`date\`),
        CONSTRAINT \`StaffAttendance_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`StaffAttendance_locationId_fkey\` FOREIGN KEY (\`locationId\`) REFERENCES \`AttendanceLocation\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE
      )`,
    ],
  },
  {
    name: 'add_AttendanceLocation_resumptionTime',
    sql: [
      "ALTER TABLE `AttendanceLocation` ADD COLUMN `resumptionTime` VARCHAR(5) NOT NULL DEFAULT '08:00'",
    ],
  },
  {
    name: 'add_leave_management',
    sql: [
      `CREATE TABLE IF NOT EXISTS \`LeaveRequest\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`staffId\` BIGINT NOT NULL,
        \`type\` ENUM('ANNUAL','SICK','MATERNITY','PATERNITY','UNPAID','OTHER') NOT NULL DEFAULT 'OTHER',
        \`startDate\` DATE NOT NULL,
        \`endDate\` DATE NOT NULL,
        \`days\` INT NOT NULL,
        \`reason\` TEXT NOT NULL,
        \`proofFile\` VARCHAR(255) NULL,
        \`status\` ENUM('PENDING','APPROVED','REJECTED') NOT NULL DEFAULT 'PENDING',
        \`adminNote\` TEXT NULL,
        \`reviewedAt\` DATETIME(3) NULL,
        \`reviewedBy\` BIGINT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`LeaveRequest_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    ],
  },
  {
    name: 'add_leave_entitlements',
    sql: [
      `CREATE TABLE IF NOT EXISTS \`LeaveEntitlement\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`schoolId\` BIGINT NOT NULL,
        \`type\` ENUM('ANNUAL','SICK','MATERNITY','PATERNITY','UNPAID','OTHER') NOT NULL,
        \`days\` INT NOT NULL DEFAULT 0,
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`LeaveEntitlement_schoolId_type_key\` (\`schoolId\`, \`type\`),
        CONSTRAINT \`LeaveEntitlement_schoolId_fkey\` FOREIGN KEY (\`schoolId\`) REFERENCES \`School\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      )`,
    ],
  },
  {
    name: 'add_payroll_tables',
    sql: [
      `CREATE TABLE IF NOT EXISTS \`PayrollSalarySetup\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`staffId\` BIGINT NOT NULL,
        \`basicSalary\` DECIMAL(12,2) NOT NULL,
        \`housingAllowance\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`transportAllowance\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`otherAllowance\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`taxRate\` DECIMAL(5,2) NOT NULL DEFAULT 0,
        \`pensionRate\` DECIMAL(5,2) NOT NULL DEFAULT 0,
        \`effectiveFrom\` DATE NOT NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`PayrollSalarySetup_staffId_key\` (\`staffId\`),
        CONSTRAINT \`PayrollSalarySetup_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS \`PayrollDeduction\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`schoolId\` BIGINT NOT NULL,
        \`staffId\` BIGINT NULL,
        \`title\` VARCHAR(150) NOT NULL,
        \`amount\` DECIMAL(12,2) NOT NULL,
        \`recurring\` BOOLEAN NOT NULL DEFAULT FALSE,
        \`month\` INT NULL,
        \`year\` INT NULL,
        \`note\` VARCHAR(255) NULL,
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        CONSTRAINT \`PayrollDeduction_schoolId_fkey\` FOREIGN KEY (\`schoolId\`) REFERENCES \`School\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`PayrollDeduction_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS \`PayrollPayslip\` (
        \`id\` BIGINT NOT NULL AUTO_INCREMENT,
        \`staffId\` BIGINT NOT NULL,
        \`month\` INT NOT NULL,
        \`year\` INT NOT NULL,
        \`basicSalary\` DECIMAL(12,2) NOT NULL,
        \`housingAllowance\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`transportAllowance\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`otherAllowance\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`grossPay\` DECIMAL(12,2) NOT NULL,
        \`taxAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`pensionAmount\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`deductions\` DECIMAL(12,2) NOT NULL DEFAULT 0,
        \`netPay\` DECIMAL(12,2) NOT NULL,
        \`status\` ENUM('DRAFT','ISSUED','PAID') NOT NULL DEFAULT 'ISSUED',
        \`generatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        \`updatedAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`PayrollPayslip_staffId_month_year_key\` (\`staffId\`, \`month\`, \`year\`),
        KEY \`PayrollPayslip_year_month_idx\` (\`year\`, \`month\`),
        CONSTRAINT \`PayrollPayslip_staffId_fkey\` FOREIGN KEY (\`staffId\`) REFERENCES \`Staff\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
      )`,
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
          if (err.code === 'ER_DUP_FIELDNAME' || err.code === 'ER_DUP_KEY' || err.errno === 1060 || err.errno === 1061
              || err.errno === 1022 || err.code === 'ER_TABLE_EXISTS_ERROR' || err.errno === 1050
              || (err.message && err.message.includes('Duplicate'))) {
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
