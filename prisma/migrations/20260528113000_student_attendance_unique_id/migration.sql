ALTER TABLE `StudentAttendance`
  DROP FOREIGN KEY `StudentAttendance_studentId_fkey`;

ALTER TABLE `StudentAttendance`
  DROP INDEX `StudentAttendance_studentId_date_key`;

ALTER TABLE `StudentAttendance`
  ADD COLUMN `studentUniqueId` VARCHAR(100) NULL;

UPDATE `StudentAttendance` sa
JOIN `User` u ON u.`id` = sa.`studentId`
SET sa.`studentUniqueId` = u.`uniqueId`;

ALTER TABLE `StudentAttendance`
  MODIFY `studentUniqueId` VARCHAR(100) NOT NULL;

ALTER TABLE `StudentAttendance`
  DROP COLUMN `studentId`;

ALTER TABLE `StudentAttendance`
  CHANGE `studentUniqueId` `studentId` VARCHAR(100) NOT NULL;

CREATE UNIQUE INDEX `StudentAttendance_studentId_date_key`
  ON `StudentAttendance`(`studentId`, `date`);

ALTER TABLE `StudentAttendance`
  ADD CONSTRAINT `StudentAttendance_studentId_fkey`
  FOREIGN KEY (`studentId`) REFERENCES `User`(`uniqueId`)
  ON DELETE CASCADE ON UPDATE CASCADE;
