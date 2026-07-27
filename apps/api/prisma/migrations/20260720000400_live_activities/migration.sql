CREATE TABLE `live_activities` (
  `id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `type` ENUM('WALK','RUN','RIDE','HIKE') NOT NULL,
  `visibility` ENUM('PUBLIC','FOLLOWERS','PRIVATE') NOT NULL DEFAULT 'FOLLOWERS',
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `duration_s` INTEGER NOT NULL DEFAULT 0,
  `distance_m` INTEGER NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_updated_at` DATETIME(3) NOT NULL,
  `ended_at` DATETIME(3) NULL,
  INDEX `live_activities_user_id_active_idx`(`user_id`,`active`),
  INDEX `live_activities_active_visibility_latitude_longitude_idx`(`active`,`visibility`,`latitude`,`longitude`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE TABLE `live_activity_joins` (
  `live_activity_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `live_activity_joins_user_id_created_at_idx`(`user_id`,`created_at`),
  PRIMARY KEY (`live_activity_id`,`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER TABLE `live_activities` ADD CONSTRAINT `live_activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `live_activity_joins` ADD CONSTRAINT `live_activity_joins_live_activity_id_fkey` FOREIGN KEY (`live_activity_id`) REFERENCES `live_activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `live_activity_joins` ADD CONSTRAINT `live_activity_joins_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
