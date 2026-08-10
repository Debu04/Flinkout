-- Scope idempotency keys to their owner; a client UUID is not globally trusted.
DROP INDEX `activities_client_id_key` ON `activities`;
CREATE UNIQUE INDEX `activities_user_id_client_id_key` ON `activities`(`user_id`, `client_id`);
