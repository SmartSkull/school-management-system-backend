-- Run this SQL in your MySQL database (greakings)

-- School fees configuration per class per term/session
CREATE TABLE IF NOT EXISTS school_fees_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  class VARCHAR(100) NOT NULL,
  session VARCHAR(20) NOT NULL,
  term VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL DEFAULT 0,
  description VARCHAR(255) DEFAULT '',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY unique_class_session_term (class, session, term)
);

-- School fees payment records
CREATE TABLE IF NOT EXISTS school_fees_payment (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id VARCHAR(100) NOT NULL,
  class VARCHAR(100) NOT NULL,
  session VARCHAR(20) NOT NULL,
  term VARCHAR(20) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  paystack_reference VARCHAR(100) UNIQUE,
  paystack_access_code VARCHAR(255),
  status ENUM('pending', 'success', 'failed') DEFAULT 'pending',
  paid_at DATETIME NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_student (student_id),
  INDEX idx_session_term (session, term)
);
