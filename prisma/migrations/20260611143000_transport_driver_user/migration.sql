-- Link TransportDriver to a User (staff account) optionally
ALTER TABLE `TransportDriver` ADD COLUMN `userId` BIGINT NULL;
ALTER TABLE `TransportDriver` ADD CONSTRAINT `TransportDriver_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
