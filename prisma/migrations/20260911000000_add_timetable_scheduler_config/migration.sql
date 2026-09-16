CREATE TABLE `TimetableSchedulerConfig` (
  `id` BIGINT NOT NULL AUTO_INCREMENT,
  `schoolId` BIGINT NOT NULL,
  `content` LONGTEXT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,

  UNIQUE INDEX `TimetableSchedulerConfig_schoolId_key`(`schoolId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `TimetableSchedulerConfig`
  ADD CONSTRAINT `TimetableSchedulerConfig_schoolId_fkey`
  FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
