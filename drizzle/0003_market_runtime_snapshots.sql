CREATE TABLE IF NOT EXISTS `runtime_snapshots` (
	`cache_key` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
