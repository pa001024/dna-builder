CREATE TABLE `abyss_usage_role_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`season_id` integer NOT NULL,
	`role_type` text NOT NULL,
	`char_id` integer NOT NULL,
	`grade_level` integer NOT NULL,
	`created_at` text,
	FOREIGN KEY (`submission_id`) REFERENCES `abyss_usage_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_season_id_idx` ON `abyss_usage_role_participants` (`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_submission_id_idx` ON `abyss_usage_role_participants` (`submission_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_char_id_idx` ON `abyss_usage_role_participants` (`char_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_role_type_idx` ON `abyss_usage_role_participants` (`role_type`);--> statement-breakpoint
CREATE TABLE `abyss_usage_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`uid_sha256` text NOT NULL,
	`season_id` integer NOT NULL,
	`char_id` integer NOT NULL,
	`melee_id` integer NOT NULL,
	`ranged_id` integer NOT NULL,
	`support_1` integer NOT NULL,
	`support_weapon_1` integer NOT NULL,
	`support_2` integer NOT NULL,
	`support_weapon_2` integer NOT NULL,
	`pet_id` integer,
	`stars` integer NOT NULL,
	`created_at` text,
	`update_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `abyss_usage_submissions_season_uid_idx` ON `abyss_usage_submissions` (`uid_sha256`,`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_submissions_season_id_idx` ON `abyss_usage_submissions` (`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_submissions_lineup_idx` ON `abyss_usage_submissions` (`season_id`,`char_id`,`melee_id`,`ranged_id`,`support_1`,`support_weapon_1`,`support_2`,`support_weapon_2`,`pet_id`);--> statement-breakpoint
CREATE TABLE `abyss_usage_weapon_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`season_id` integer NOT NULL,
	`role_type` text NOT NULL,
	`weapon_id` integer NOT NULL,
	`skill_level` integer NOT NULL,
	`created_at` text,
	FOREIGN KEY (`submission_id`) REFERENCES `abyss_usage_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_season_id_idx` ON `abyss_usage_weapon_participants` (`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_submission_id_idx` ON `abyss_usage_weapon_participants` (`submission_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_weapon_id_idx` ON `abyss_usage_weapon_participants` (`weapon_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_role_type_idx` ON `abyss_usage_weapon_participants` (`role_type`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text,
	`qq` text,
	`pic` text,
	`uid` text,
	`roles` text,
	`experience` integer NOT NULL,
	`points` integer NOT NULL,
	`level` integer NOT NULL,
	`selected_title_asset_id` text,
	`selected_name_card_asset_id` text,
	`created_at` text,
	`update_at` text
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "name", "qq", "pic", "uid", "roles", "experience", "points", "level", "selected_title_asset_id", "selected_name_card_asset_id", "created_at", "update_at") SELECT "id", "email", "name", "qq", "pic", "uid", "roles", "experience", "points", "level", "selected_title_asset_id", "selected_name_card_asset_id", "created_at", "update_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_idx` ON `users` (`email`);