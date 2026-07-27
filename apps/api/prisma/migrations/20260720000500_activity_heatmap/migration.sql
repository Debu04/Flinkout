CREATE TABLE `activity_heat_cells` (
  `grid_key` VARCHAR(32) NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `activity_count` INTEGER NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL,
  INDEX `activity_heat_cells_latitude_longitude_idx`(`latitude`,`longitude`),
  INDEX `activity_heat_cells_activity_count_idx`(`activity_count`),
  PRIMARY KEY (`grid_key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
