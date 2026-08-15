-- Add grading fields to AssignmentSubmission
ALTER TABLE `AssignmentSubmission`
  ADD COLUMN `grade`    VARCHAR(20)   NULL,
  ADD COLUMN `feedback` TEXT          NULL,
  ADD COLUMN `gradedAt` DATETIME(3)   NULL;
