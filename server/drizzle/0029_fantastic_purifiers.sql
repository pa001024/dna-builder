CREATE TABLE `game_mod_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`mod_id` text NOT NULL,
	`version` text NOT NULL,
	`changelog` text,
	`file_name` text NOT NULL,
	`file_key` text NOT NULL,
	`file_size` integer NOT NULL,
	`downloads` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`mod_id`) REFERENCES `game_mods`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_mod_versions_mod_id_idx` ON `game_mod_versions` (`mod_id`);--> statement-breakpoint
CREATE INDEX `game_mod_versions_created_at_idx` ON `game_mod_versions` (`created_at`);--> statement-breakpoint
CREATE TABLE `game_mods` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`category` text NOT NULL,
	`entity` text,
	`cover_key` text,
	`mod_json` text,
	`source` text,
	`requires` text,
	`user_id` text NOT NULL,
	`downloads` integer NOT NULL,
	`views` integer NOT NULL,
	`likes` integer NOT NULL,
	`is_active` integer NOT NULL,
	`status` text NOT NULL,
	`images` text,
	`is_recommended` integer NOT NULL,
	`is_pinned` integer NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `game_mods_category_idx` ON `game_mods` (`category`);--> statement-breakpoint
CREATE INDEX `game_mods_entity_idx` ON `game_mods` (`entity`);--> statement-breakpoint
CREATE INDEX `game_mods_user_id_idx` ON `game_mods` (`user_id`);--> statement-breakpoint
CREATE INDEX `game_mods_created_at_idx` ON `game_mods` (`created_at`);--> statement-breakpoint
CREATE INDEX `game_mods_is_active_idx` ON `game_mods` (`is_active`);