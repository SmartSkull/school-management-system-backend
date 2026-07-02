-- AlterTable: add startTime and endTime to CbtTest for per-subject scheduling
ALTER TABLE `CbtTest` ADD COLUMN `startTime` DATETIME(3) NULL;
ALTER TABLE `CbtTest` ADD COLUMN `endTime` DATETIME(3) NULL;
