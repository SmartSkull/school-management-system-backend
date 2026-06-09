-- CreateTable
CREATE TABLE `TransportRoute` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NULL,
    `name` VARCHAR(150) NOT NULL,
    `description` VARCHAR(255) NULL,
    `fare` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransportDriver` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NULL,
    `name` VARCHAR(150) NOT NULL,
    `phone` VARCHAR(30) NULL,
    `licenseNo` VARCHAR(60) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransportBus` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NULL,
    `routeId` BIGINT NULL,
    `driverId` BIGINT NULL,
    `plateNumber` VARCHAR(30) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 40,
    `gpsLat` DECIMAL(10, 7) NULL,
    `gpsLng` DECIMAL(10, 7) NULL,
    `gpsUpdatedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `TransportAssignment` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `busId` BIGINT NOT NULL,
    `studentId` BIGINT NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `TransportAssignment_studentId_key`(`studentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `TransportRoute` ADD CONSTRAINT `TransportRoute_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportDriver` ADD CONSTRAINT `TransportDriver_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBus` ADD CONSTRAINT `TransportBus_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBus` ADD CONSTRAINT `TransportBus_routeId_fkey` FOREIGN KEY (`routeId`) REFERENCES `TransportRoute`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportBus` ADD CONSTRAINT `TransportBus_driverId_fkey` FOREIGN KEY (`driverId`) REFERENCES `TransportDriver`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportAssignment` ADD CONSTRAINT `TransportAssignment_busId_fkey` FOREIGN KEY (`busId`) REFERENCES `TransportBus`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `TransportAssignment` ADD CONSTRAINT `TransportAssignment_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
