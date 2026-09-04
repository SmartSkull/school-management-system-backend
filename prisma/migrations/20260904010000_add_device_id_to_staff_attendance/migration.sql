-- Add deviceId to StaffAttendance for device-locked clock-in enforcement
ALTER TABLE `StaffAttendance` ADD COLUMN `deviceId` VARCHAR(255) NULL AFTER `note`;
