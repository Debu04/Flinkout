ALTER TABLE `profiles`
  ADD COLUMN `route_visibility` ENUM('PUBLIC', 'FOLLOWERS', 'PRIVATE') NOT NULL DEFAULT 'PRIVATE',
  ADD COLUMN `discovery_lat` DOUBLE NULL,
  ADD COLUMN `discovery_lng` DOUBLE NULL,
  ADD COLUMN `discovery_updated_at` DATETIME(3) NULL;

ALTER TABLE `activities`
  ADD COLUMN `start_lat` DOUBLE NULL,
  ADD COLUMN `start_lng` DOUBLE NULL;

CREATE INDEX `profiles_discoverable_discovery_lat_discovery_lng_idx` ON `profiles`(`discoverable`, `discovery_lat`, `discovery_lng`);
CREATE INDEX `activities_visibility_start_lat_start_lng_idx` ON `activities`(`visibility`, `start_lat`, `start_lng`);
