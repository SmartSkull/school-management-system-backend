CREATE TABLE `PayrollSalarySetup` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `staffId` BIGINT NOT NULL,
  `basicSalary` DECIMAL(12, 2) NOT NULL,
  `housingAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `transportAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `otherAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `taxRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
  `pensionRate` DECIMAL(5, 2) NOT NULL DEFAULT 0,
  `effectiveFrom` DATE NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PayrollSalarySetup_staffId_key` (`staffId`),
  CONSTRAINT `PayrollSalarySetup_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollDeduction` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `schoolId` BIGINT NOT NULL,
  `staffId` BIGINT NULL,
  `title` VARCHAR(150) NOT NULL,
  `amount` DECIMAL(12, 2) NOT NULL,
  `recurring` BOOLEAN NOT NULL DEFAULT false,
  `month` INTEGER NULL,
  `year` INTEGER NULL,
  `note` VARCHAR(255) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `PayrollDeduction_schoolId_idx` (`schoolId`),
  INDEX `PayrollDeduction_staffId_idx` (`staffId`),
  CONSTRAINT `PayrollDeduction_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `PayrollDeduction_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PayrollPayslip` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `staffId` BIGINT NOT NULL,
  `month` INTEGER NOT NULL,
  `year` INTEGER NOT NULL,
  `basicSalary` DECIMAL(12, 2) NOT NULL,
  `housingAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `transportAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `otherAllowance` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `grossPay` DECIMAL(12, 2) NOT NULL,
  `taxAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `pensionAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `deductions` DECIMAL(12, 2) NOT NULL DEFAULT 0,
  `netPay` DECIMAL(12, 2) NOT NULL,
  `status` ENUM('DRAFT', 'ISSUED', 'PAID') NOT NULL DEFAULT 'ISSUED',
  `generatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `PayrollPayslip_staffId_month_year_key` (`staffId`, `month`, `year`),
  INDEX `PayrollPayslip_year_month_idx` (`year`, `month`),
  CONSTRAINT `PayrollPayslip_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
