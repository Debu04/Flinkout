ALTER TABLE `activities` ADD COLUMN `moving_time_s` INTEGER NOT NULL DEFAULT 0;
ALTER TABLE `activities` ADD COLUMN `average_pace_s_per_km` DOUBLE NULL;
ALTER TABLE `activities` ADD COLUMN `calories_kcal` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `activities` ADD COLUMN `current_elevation_m` DOUBLE NULL;
ALTER TABLE `activities` ADD COLUMN `elevation_gain_m` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `activities` ADD COLUMN `elevation_loss_m` DOUBLE NOT NULL DEFAULT 0;
