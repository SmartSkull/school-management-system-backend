-- Add review workflow fields to LessonPlan
ALTER TABLE `LessonPlan` ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'DRAFT' AFTER `duration`, ADD COLUMN `reviewComment` TEXT NULL AFTER `status`, ADD COLUMN `reviewedAt` DATETIME NULL AFTER `reviewComment`, ADD COLUMN `reviewedBy` BIGINT NULL AFTER `reviewedAt`;
