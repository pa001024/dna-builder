CREATE TABLE `script_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` text,
	`update_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `script_categories_name_idx` ON `script_categories` (`name`);