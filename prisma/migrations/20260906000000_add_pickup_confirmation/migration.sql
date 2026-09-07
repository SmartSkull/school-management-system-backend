-- Add parent pickup confirmation fields to TransportAssignment
ALTER TABLE `TransportAssignment` ADD COLUMN `pickupStatus` VARCHAR(30) NULL DEFAULT 'SCHEDULED' AFTER `pickedUpAt`, ADD COLUMN `parentConfirmToken` VARCHAR(100) NULL AFTER `pickupStatus`, ADD COLUMN `pendingConfirmAt` DATETIME NULL AFTER `parentConfirmToken`;
