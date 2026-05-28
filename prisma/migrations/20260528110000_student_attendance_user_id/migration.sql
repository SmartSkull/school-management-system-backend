SET @fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'StudentAttendance'
    AND CONSTRAINT_NAME = 'StudentAttendance_studentId_fkey'
);

SET @drop_fk := IF(
  @fk_exists = 1,
  'ALTER TABLE `StudentAttendance` DROP FOREIGN KEY `StudentAttendance_studentId_fkey`',
  'SELECT 1'
);

PREPARE drop_fk_stmt FROM @drop_fk;
EXECUTE drop_fk_stmt;
DEALLOCATE PREPARE drop_fk_stmt;

DELETE old_rows
FROM `StudentAttendance` old_rows
JOIN `Student` s ON s.`id` = old_rows.`studentId`
JOIN `StudentAttendance` user_rows
  ON user_rows.`studentId` = s.`userId`
  AND user_rows.`date` = old_rows.`date`
  AND user_rows.`id` <> old_rows.`id`;

UPDATE `StudentAttendance` sa
JOIN `Student` s ON s.`id` = sa.`studentId`
SET sa.`studentId` = s.`userId`;

SET @fk_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'StudentAttendance'
    AND CONSTRAINT_NAME = 'StudentAttendance_studentId_fkey'
);

SET @add_fk := IF(
  @fk_exists = 0,
  'ALTER TABLE `StudentAttendance` ADD CONSTRAINT `StudentAttendance_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE',
  'SELECT 1'
);

PREPARE add_fk_stmt FROM @add_fk;
EXECUTE add_fk_stmt;
DEALLOCATE PREPARE add_fk_stmt;
