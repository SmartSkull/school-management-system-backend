-- Add sectionLabel and sectionOrder to CbtQuestion for section-aware shuffling
ALTER TABLE `CbtQuestion`
  ADD COLUMN `sectionLabel` TEXT NULL,
  ADD COLUMN `sectionOrder` INT NOT NULL DEFAULT 0;
