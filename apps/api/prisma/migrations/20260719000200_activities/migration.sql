-- Phase 2: persisted activity ownership and server-enforced visibility model.
CREATE TABLE `activities` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `client_id` CHAR(36) NOT NULL,
    `type` ENUM('WALK', 'RUN', 'RIDE', 'HIKE') NOT NULL,
    `visibility` ENUM('PUBLIC', 'FOLLOWERS', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
    `started_at` DATETIME(3) NOT NULL,
    `ended_at` DATETIME(3) NULL,
    `duration_s` INTEGER NOT NULL DEFAULT 0,
    `distance_m` INTEGER NOT NULL DEFAULT 0,
    `route` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `activities_client_id_key`(`client_id`),
    INDEX `activities_user_id_started_at_idx`(`user_id`, `started_at`),
    INDEX `activities_visibility_started_at_idx`(`visibility`, `started_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `activities` ADD CONSTRAINT `activities_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
