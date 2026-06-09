-- CreateTable
CREATE TABLE `Hostel` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NULL,
    `name` VARCHAR(150) NOT NULL,
    `gender` VARCHAR(10) NOT NULL DEFAULT 'MIXED',
    `capacity` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HostelRoom` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `hostelId` BIGINT NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `capacity` INTEGER NOT NULL DEFAULT 4,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HostelBed` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `roomId` BIGINT NOT NULL,
    `bedNumber` VARCHAR(20) NOT NULL,
    `studentId` BIGINT NULL,
    `assignedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `HostelBed_studentId_key`(`studentId`),
    UNIQUE INDEX `HostelBed_roomId_bedNumber_key`(`roomId`, `bedNumber`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HostelAttendance` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `studentId` BIGINT NOT NULL,
    `date` DATE NOT NULL,
    `present` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(255) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `HostelAttendance_studentId_date_key`(`studentId`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Hostel` ADD CONSTRAINT `Hostel_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelRoom` ADD CONSTRAINT `HostelRoom_hostelId_fkey` FOREIGN KEY (`hostelId`) REFERENCES `Hostel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelBed` ADD CONSTRAINT `HostelBed_roomId_fkey` FOREIGN KEY (`roomId`) REFERENCES `HostelRoom`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelBed` ADD CONSTRAINT `HostelBed_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HostelAttendance` ADD CONSTRAINT `HostelAttendance_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
