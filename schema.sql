-- schema.sql
-- Ethiopian Airlines Toolroom DB setup
-- run this to create everything from scratch
-- NOTE: drops and recreates the database, dont run on prod with live data

DROP DATABASE IF EXISTS `Manage_tool`;
CREATE DATABASE `Manage_tool`
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

USE `Manage_tool`;

-- users - covers admins, toolkeepers and technicians
-- role enum is enforced here so bad values cant get in
CREATE TABLE `users` (
    `id`             INT AUTO_INCREMENT PRIMARY KEY,
    `badge`          VARCHAR(50)  NOT NULL UNIQUE,
    `name`           VARCHAR(100) NOT NULL,
    `department`     VARCHAR(50)  NOT NULL,
    `role`           ENUM('Admin','Toolkeeper','Technician') NOT NULL,
    `email`          VARCHAR(100) DEFAULT NULL,
    `phone`          VARCHAR(20)  DEFAULT NULL,
    `password_hash`  VARCHAR(255) NOT NULL,
    `reset_token`    VARCHAR(64)  DEFAULT NULL,
    `reset_expires`  DATETIME     DEFAULT NULL,
    `created_at`     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- tools inventory
CREATE TABLE `tools` (
    `id`              INT AUTO_INCREMENT PRIMARY KEY,
    `internal_id`     VARCHAR(50)  NOT NULL UNIQUE,
    `name`            VARCHAR(100) NOT NULL,
    `dept`            VARCHAR(50)  NOT NULL,
    `category`        VARCHAR(50)  DEFAULT NULL,
    `location`        VARCHAR(100) DEFAULT NULL,
    `purchase_date`   DATE         DEFAULT NULL,
    `price`           DECIMAL(10,2)DEFAULT NULL,
    `calibration_due` DATE         DEFAULT NULL,
    `manufacturer`    VARCHAR(100) DEFAULT NULL,
    `model`           VARCHAR(100) DEFAULT NULL,
    `notes`           TEXT         DEFAULT NULL,
    `status`          ENUM('Available','In Use','Maintenance','Lost','Total Damage') NOT NULL DEFAULT 'Available'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- checkout records - one row per tool per borrow
CREATE TABLE `checkouts` (
    `id`          INT  AUTO_INCREMENT PRIMARY KEY,
    `tool_id`     INT  NOT NULL,
    `employee_id` INT  NOT NULL,
    `work_order`  VARCHAR(50) NOT NULL,
    `date_out`    DATE NOT NULL,
    `due_date`    DATE NOT NULL,
    `return_date` DATE DEFAULT NULL,
    `status`      ENUM('Active','Returned') NOT NULL DEFAULT 'Active',
    FOREIGN KEY (`tool_id`)     REFERENCES `tools`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`employee_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
    INDEX idx_status_due (status, due_date),
    INDEX idx_employee   (employee_id),
    INDEX idx_tool       (tool_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE `maintenance` (
    `id`            INT AUTO_INCREMENT PRIMARY KEY,
    `tool_id`       INT  NOT NULL,
    `issue`         TEXT NOT NULL,
    `date_reported` DATE NOT NULL,
    `date_resolved` DATE DEFAULT NULL,
    `status`        ENUM('Open','Resolved','Lost') NOT NULL DEFAULT 'Open',
    FOREIGN KEY (`tool_id`) REFERENCES `tools`(`id`) ON DELETE CASCADE,
    INDEX idx_status (status),
    INDEX idx_tool   (tool_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- every action gets logged here - checkout, return, settings change, login, etc
CREATE TABLE `activity_log` (
    `id`        INT AUTO_INCREMENT PRIMARY KEY,
    `user_id`   INT  DEFAULT NULL,
    `action`    TEXT NOT NULL,
    `timestamp` DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
    INDEX idx_timestamp (timestamp),
    INDEX idx_user      (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- flat key/value store for app settings
-- values are json strings, parsed in api.php
CREATE TABLE `settings` (
    `setting_key`   VARCHAR(100) PRIMARY KEY,
    `setting_value` TEXT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- users - passwords set by set_passwords.php after import
-- hashes below match the passwords in set_passwords.php
INSERT INTO `users` (`badge`, `name`, `department`, `role`, `email`, `phone`, `password_hash`) VALUES
('22500',   'Syum Degif',      'Administration', 'Admin',      'syum.degif@ethiopianairlines.com',    '+251911225001', '$2y$10$TI4EdVjXpsQwBuyFseYwj.DqewTjIAJ7H.F6fgnFbv3cnz9Jq7kse'),
('REDIEAT', 'Redieat',         'Toolroom',       'Toolkeeper', 'redieat@ethiopianairlines.com',       '+251911225002', '$2y$10$RTvrJBUJ.b6DWoTtgnjwLulrNjaxH3xcb2u9mmRFgJayynt/.KiQq'),
('38011',   'Musie Gher',      'Mechanical',     'Technician', 'musie.gher@ethiopianairlines.com',    '+251911380011', '$2y$10$uLXkAE7s9hmsU1f.nC3dYONiAl.rb1TdxlL6BmfaicGShzPbAOXxq'),
('38012',   'Hundaual Lemma',  'Avionics',       'Technician', 'hundaual.lemma@ethiopianairlines.com','+251911380012', '$2y$10$t.MBvTccDDKYgKbX0KX26.bqdcgPkrEubbdVIrEGU/npRrKjFDfKm'),
('37993',   'Eyob Brye',       'Electrical',     'Technician', 'eyob.brye@ethiopianairlines.com',     '+251911379930', '$2y$10$BloU7VgO/VjqEZnC86Ffx.1g1PqAogwqlPb3rUeKUbwwsFJNLd46i');

INSERT INTO `tools`
    (`internal_id`, `name`, `dept`, `category`, `location`, `purchase_date`, `price`, `calibration_due`, `manufacturer`, `model`, `status`)
VALUES
('TW-001',  'Torque Wrench 50nm',  'Mechanical',    'Hand Tools',       'A1-Shelf3',    '2023-01-15', 450.00,  '2024-12-31', 'Snap-on',    'TQ50',      'Available'),
('TW-002',  'Torque Wrench 100nm', 'Mechanical',    'Hand Tools',       'A1-Shelf3',    '2023-02-10', 550.00,  '2024-12-31', 'Snap-on',    'TQ100',     'Available'),
('DMM-001', 'Digital Multimeter',  'Avionics',      'Measuring Tools',  'B3-Cabinet2',  '2023-03-20', 320.00,  '2025-01-15', 'Fluke',      '87V',       'In Use'),
('DMM-002', 'Digital Multimeter',  'Avionics',      'Measuring Tools',  'B3-Cabinet2',  '2023-04-15', 320.00,  '2025-01-15', 'Fluke',      '87V',       'Available'),
('HD-001',  'Hydraulic Drill',     'Mechanical',    'Power Tools',      'C1-Locker4',   '2022-11-10', 1200.00, NULL,         'DeWalt',     'DCD995',    'Maintenance'),
('OS-001',  'Oscilloscope',        'Avionics',      'Testing Equipment','B3-Bench1',    '2023-05-01', 2500.00, '2024-10-30', 'Tektronix',  'TBS1052B',  'Available'),
('SG-001',  'Signal Generator',    'Avionics',      'Testing Equipment','B3-Bench2',    '2023-06-15', 1800.00, '2024-11-15', 'Keysight',   '33600A',    'Available'),
('WR-001',  'Wire Stripper',       'Electrical',    'Hand Tools',       'D2-Drawer5',   '2023-07-01', 45.00,   NULL,         'Klein Tools','11063W',    'Available'),
('CR-001',  'Crimping Tool',       'Electrical',    'Hand Tools',       'D2-Drawer6',   '2023-07-01', 120.00,  NULL,         'TE Connectivity','58530-1','Available'),
('SA-001',  'Socket Set 1/2"',     'Mechanical',    'Hand Tools',       'A1-Shelf1',    '2023-08-15', 280.00,  NULL,         'Stanley',    '92-849',    'Available'),
('MP-001',  'Multipurpose Meter',  'Ground Support','Measuring Tools',  'E1-Cabinet1',  '2023-09-10', 150.00,  '2025-03-01', 'Amprobe',    'AM-530',    'Available'),
('TL-001',  'Torque Limiter',      'Mechanical',    'Safety Equipment', 'A1-Shelf2',    '2023-10-01', 890.00,  '2024-09-30', 'Norbar',     '15003',     'Available');

INSERT INTO `checkouts` (`tool_id`, `employee_id`, `work_order`, `date_out`, `due_date`, `return_date`, `status`) VALUES
(3, 3, 'WO-2024-001', '2024-01-15', '2024-01-29', '2024-01-28', 'Returned'),
(1, 4, 'FL-ET-456',   '2024-02-01', '2024-02-15', '2024-02-14', 'Returned'),
(3, 5, 'WO-2024-045', '2024-02-10', '2024-02-24', NULL,         'Active'),
(4, 3, 'FL-ET-789',   '2024-02-05', '2024-02-19', '2024-02-18', 'Returned'),
(8, 4, 'WO-2024-067', '2024-02-12', '2024-02-26', NULL,         'Active');

INSERT INTO `maintenance` (`tool_id`, `issue`, `date_reported`, `date_resolved`, `status`) VALUES
(5, 'Drill bit chuck not holding - excessive wobble when spinning', '2024-01-20', NULL,         'Open'),
(2, 'Calibration out of spec, reading ~5% high',                   '2024-01-25', '2024-02-01', 'Resolved');

INSERT INTO `activity_log` (`user_id`, `action`, `timestamp`) VALUES
(1, 'System initialized',                                           '2024-01-01 08:00:00'),
(1, 'Added new tool: Torque Wrench 50nm (TW-001)',                  '2024-01-15 09:30:00'),
(2, 'Checked out tool DMM-001 to Musie Gher',                      '2024-02-10 10:15:00'),
(2, 'Processed return of tool TW-001 from Hundaual Lemma',         '2024-02-14 14:20:00'),
(3, 'Reported maintenance issue for Hydraulic Drill HD-001',        '2024-01-20 11:45:00');

-- default settings - these get overwritten through the UI
INSERT INTO `settings` (`setting_key`, `setting_value`) VALUES
('permissions',    '{"toolkeeper":{"add":true,"edit":true,"delete":false,"maint":true,"export":true},"technician":{"checkout":true,"checkin":true,"report":true,"view":true,"request":false}}'),
('workflows',      '{"requireHighValueApproval":false,"highValueThreshold":1000,"requireOvertimeApproval":false,"requireMaintApproval":false,"maxToolsPerCheckout":10,"maxCheckoutDays":14,"allowWeekendCheckout":true}'),
('departments',    '["Mechanical","Avionics","Electrical","Ground Support","Administration"]'),
('categories',     '["Hand Tools","Power Tools","Measuring Tools","Safety Equipment","Testing Equipment"]'),
('alerts',         '{"lowStock":{"enabled":true,"threshold":5},"maintenance":{"enabled":true,"preventive":false,"reminderDays":7},"expiration":{"enabled":true,"alertDays":30}}'),
('notifications',  '{"methods":{"email":true,"sms":false,"dashboard":true},"email":"admin@ethiopianairlines.com","phone":"","events":{"checkout":false,"overdue":true,"maint":true,"newTool":false}}'),
('backup',         '{"autoBackup":true,"frequency":"weekly","retention":30,"backups":[]}');

-- extra indexes on top of what the FKs create
CREATE INDEX idx_tools_status        ON tools(status);
CREATE INDEX idx_tools_dept          ON tools(dept);
CREATE INDEX idx_checkouts_due_date  ON checkouts(due_date);
CREATE INDEX idx_activity_timestamp  ON activity_log(timestamp);

SELECT 'setup done' as status;
SELECT COUNT(*) as users FROM users;
SELECT COUNT(*) as tools FROM tools;
SELECT status, COUNT(*) as n FROM tools GROUP BY status;
