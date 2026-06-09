-- CreateTable
CREATE TABLE `Book` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `schoolId` BIGINT NULL,
    `title` VARCHAR(200) NOT NULL,
    `author` VARCHAR(150) NOT NULL,
    `isbn` VARCHAR(50) NULL,
    `barcode` VARCHAR(100) NULL,
    `category` VARCHAR(100) NULL,
    `copies` INTEGER NOT NULL DEFAULT 1,
    `available` INTEGER NOT NULL DEFAULT 1,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Book_barcode_key`(`barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BookBorrow` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `bookId` BIGINT NOT NULL,
    `studentId` BIGINT NOT NULL,
    `borrowedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dueDate` DATETIME(3) NOT NULL,
    `returnedAt` DATETIME(3) NULL,
    `fine` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `finePaid` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Book` ADD CONSTRAINT `Book_schoolId_fkey` FOREIGN KEY (`schoolId`) REFERENCES `School`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookBorrow` ADD CONSTRAINT `BookBorrow_bookId_fkey` FOREIGN KEY (`bookId`) REFERENCES `Book`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BookBorrow` ADD CONSTRAINT `BookBorrow_studentId_fkey` FOREIGN KEY (`studentId`) REFERENCES `Student`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
