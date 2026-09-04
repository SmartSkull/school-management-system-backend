-- Add deviceId to StudentAttendance for device-locked clock-in enforcement
ALTER TABLE `StudentAttendance` ADD COLUMN `deviceId` VARCHAR(255) NULL AFTER `note`;
