-- Add principal name and signature URL to the School table
ALTER TABLE `School`
  ADD COLUMN `principal` VARCHAR(150) NULL,
  ADD COLUMN `signature` VARCHAR(500) NULL;
