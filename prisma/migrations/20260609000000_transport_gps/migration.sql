-- Add polyline to TransportRoute
ALTER TABLE `TransportRoute` ADD COLUMN `polyline` JSON NULL;

-- Add trip + token fields to TransportBus
ALTER TABLE `TransportBus`
  ADD COLUMN `tripActive` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `tripDate` DATETIME(3) NULL,
  ADD COLUMN `driverToken` VARCHAR(64) NULL,
  ADD UNIQUE INDEX `TransportBus_driverToken_key`(`driverToken`);

-- Add alertedAt to TransportAssignment
ALTER TABLE `TransportAssignment` ADD COLUMN `alertedAt` DATETIME(3) NULL;

-- Add parent location fields to Student
ALTER TABLE `Student`
  ADD COLUMN `parentEmail` VARCHAR(255) NULL,
  ADD COLUMN `parentLat` DECIMAL(10,7) NULL,
  ADD COLUMN `parentLng` DECIMAL(10,7) NULL;
