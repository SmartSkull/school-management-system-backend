-- Add faceUuid to Student for Luxand Cloud face recognition
ALTER TABLE `Student` ADD COLUMN `faceUuid` VARCHAR(255) NULL AFTER `bloodGroup`;
