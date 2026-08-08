ALTER TABLE `live_activities` ADD COLUMN `client_id` CHAR(36) NULL;
ALTER TABLE `live_activities` ADD COLUMN `speed_kmh` DOUBLE NOT NULL DEFAULT 0;
ALTER TABLE `live_activities` ADD COLUMN `paused` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `live_activity_joins` ADD COLUMN `active` BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE `live_activity_joins` ADD COLUMN `left_at` DATETIME(3) NULL;
CREATE UNIQUE INDEX `live_activities_user_id_client_id_key` ON `live_activities`(`user_id`, `client_id`);

CREATE TABLE `live_activity_comments` (
  `id` VARCHAR(191) NOT NULL,
  `live_activity_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `body` VARCHAR(500) NOT NULL,
  `latitude` DOUBLE NOT NULL,
  `longitude` DOUBLE NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `live_activity_comments_live_activity_id_created_at_idx`(`live_activity_id`, `created_at`),
  INDEX `live_activity_comments_user_id_created_at_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `live_activity_high_fives` (
  `live_activity_id` VARCHAR(191) NOT NULL,
  `user_id` VARCHAR(191) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `live_activity_high_fives_user_id_created_at_idx`(`user_id`, `created_at`),
  PRIMARY KEY (`live_activity_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `live_activity_comments` ADD CONSTRAINT `live_activity_comments_live_activity_id_fkey` FOREIGN KEY (`live_activity_id`) REFERENCES `live_activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `live_activity_comments` ADD CONSTRAINT `live_activity_comments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `live_activity_high_fives` ADD CONSTRAINT `live_activity_high_fives_live_activity_id_fkey` FOREIGN KEY (`live_activity_id`) REFERENCES `live_activities`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `live_activity_high_fives` ADD CONSTRAINT `live_activity_high_fives_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
