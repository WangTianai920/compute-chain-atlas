ALTER TABLE `companies` ADD `name_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `thesis_en` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `en_source_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `en_status` text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `companies` ADD `en_updated_at` text;