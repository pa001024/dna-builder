PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_abyss_usage_role_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`season_id` integer NOT NULL,
	`role_type` text NOT NULL,
	`char_id` integer NOT NULL,
	`grade_level` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `abyss_usage_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_abyss_usage_role_participants`("id", "submission_id", "season_id", "role_type", "char_id", "grade_level", "created_at") SELECT "id", "submission_id", "season_id", "role_type", "char_id", "grade_level", "created_at" FROM `abyss_usage_role_participants`;--> statement-breakpoint
DROP TABLE `abyss_usage_role_participants`;--> statement-breakpoint
ALTER TABLE `__new_abyss_usage_role_participants` RENAME TO `abyss_usage_role_participants`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_season_id_idx` ON `abyss_usage_role_participants` (`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_submission_id_idx` ON `abyss_usage_role_participants` (`submission_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_char_id_idx` ON `abyss_usage_role_participants` (`char_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_role_participants_role_type_idx` ON `abyss_usage_role_participants` (`role_type`);--> statement-breakpoint
CREATE TABLE `__new_abyss_usage_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`uid_sha256` text NOT NULL,
	`season_id` integer NOT NULL,
	`level` integer,
	`char_id` integer NOT NULL,
	`melee_id` integer NOT NULL,
	`ranged_id` integer NOT NULL,
	`support_1` integer NOT NULL,
	`support_weapon_1` integer NOT NULL,
	`support_2` integer NOT NULL,
	`support_weapon_2` integer NOT NULL,
	`pet_id` integer,
	`stars` integer NOT NULL,
	`created_at` integer,
	`update_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_abyss_usage_submissions`("id", "uid_sha256", "season_id", "level", "char_id", "melee_id", "ranged_id", "support_1", "support_weapon_1", "support_2", "support_weapon_2", "pet_id", "stars", "created_at", "update_at") SELECT "id", "uid_sha256", "season_id", "level", "char_id", "melee_id", "ranged_id", "support_1", "support_weapon_1", "support_2", "support_weapon_2", "pet_id", "stars", "created_at", "update_at" FROM `abyss_usage_submissions`;--> statement-breakpoint
DROP TABLE `abyss_usage_submissions`;--> statement-breakpoint
ALTER TABLE `__new_abyss_usage_submissions` RENAME TO `abyss_usage_submissions`;--> statement-breakpoint
CREATE UNIQUE INDEX `abyss_usage_submissions_season_uid_idx` ON `abyss_usage_submissions` (`uid_sha256`,`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_submissions_season_id_idx` ON `abyss_usage_submissions` (`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_submissions_season_id_level_idx` ON `abyss_usage_submissions` (`season_id`,`level`);--> statement-breakpoint
CREATE INDEX `abyss_usage_submissions_lineup_idx` ON `abyss_usage_submissions` (`season_id`,`char_id`,`melee_id`,`ranged_id`,`support_1`,`support_weapon_1`,`support_2`,`support_weapon_2`,`pet_id`);--> statement-breakpoint
CREATE TABLE `__new_abyss_usage_weapon_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_id` text NOT NULL,
	`season_id` integer NOT NULL,
	`role_type` text NOT NULL,
	`weapon_id` integer NOT NULL,
	`skill_level` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`submission_id`) REFERENCES `abyss_usage_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_abyss_usage_weapon_participants`("id", "submission_id", "season_id", "role_type", "weapon_id", "skill_level", "created_at") SELECT "id", "submission_id", "season_id", "role_type", "weapon_id", "skill_level", "created_at" FROM `abyss_usage_weapon_participants`;--> statement-breakpoint
DROP TABLE `abyss_usage_weapon_participants`;--> statement-breakpoint
ALTER TABLE `__new_abyss_usage_weapon_participants` RENAME TO `abyss_usage_weapon_participants`;--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_season_id_idx` ON `abyss_usage_weapon_participants` (`season_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_submission_id_idx` ON `abyss_usage_weapon_participants` (`submission_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_weapon_id_idx` ON `abyss_usage_weapon_participants` (`weapon_id`);--> statement-breakpoint
CREATE INDEX `abyss_usage_weapon_participants_role_type_idx` ON `abyss_usage_weapon_participants` (`role_type`);--> statement-breakpoint
CREATE TABLE `__new_activities_ingame` (
	`id` integer NOT NULL,
	`server` text NOT NULL,
	`post_id` text,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`desc` text NOT NULL,
	`created_at` integer,
	`update_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_activities_ingame`("id", "server", "post_id", "start_time", "end_time", "name", "icon", "desc", "created_at", "update_at") SELECT "id", "server", "post_id", "start_time", "end_time", "name", "icon", "desc", "created_at", "update_at" FROM `activities_ingame`;--> statement-breakpoint
DROP TABLE `activities_ingame`;--> statement-breakpoint
ALTER TABLE `__new_activities_ingame` RENAME TO `activities_ingame`;--> statement-breakpoint
CREATE UNIQUE INDEX `activities_ingame_server_id_idx` ON `activities_ingame` (`server`,`id`);--> statement-breakpoint
CREATE INDEX `activities_ingame_server_start_time_idx` ON `activities_ingame` (`server`,`start_time`);--> statement-breakpoint
CREATE TABLE `__new_build_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`build_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_build_likes`("id", "build_id", "user_id", "created_at") SELECT "id", "build_id", "user_id", "created_at" FROM `build_likes`;--> statement-breakpoint
DROP TABLE `build_likes`;--> statement-breakpoint
ALTER TABLE `__new_build_likes` RENAME TO `build_likes`;--> statement-breakpoint
CREATE UNIQUE INDEX `build_like_idx` ON `build_likes` (`user_id`,`build_id`);--> statement-breakpoint
CREATE INDEX `build_like_build_idx` ON `build_likes` (`build_id`);--> statement-breakpoint
CREATE TABLE `__new_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`desc` text,
	`char_id` integer NOT NULL,
	`char_settings` text NOT NULL,
	`user_id` text NOT NULL,
	`views` integer DEFAULT 0,
	`likes` integer DEFAULT 0,
	`is_recommended` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_builds`("id", "title", "desc", "char_id", "char_settings", "user_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at") SELECT "id", "title", "desc", "char_id", "char_settings", "user_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at" FROM `builds`;--> statement-breakpoint
DROP TABLE `builds`;--> statement-breakpoint
ALTER TABLE `__new_builds` RENAME TO `builds`;--> statement-breakpoint
CREATE INDEX `builds_char_id_idx` ON `builds` (`char_id`);--> statement-breakpoint
CREATE INDEX `builds_user_id_idx` ON `builds` (`user_id`);--> statement-breakpoint
CREATE INDEX `builds_is_recommended_idx` ON `builds` (`is_recommended`);--> statement-breakpoint
CREATE INDEX `builds_char_id_update_at_idx` ON `builds` (`char_id`,`update_at`);--> statement-breakpoint
CREATE INDEX `builds_char_id_views_idx` ON `builds` (`char_id`,`views`);--> statement-breakpoint
CREATE INDEX `builds_update_at_idx` ON `builds` (`update_at`);--> statement-breakpoint
CREATE INDEX `builds_views_idx` ON `builds` (`views`);--> statement-breakpoint
CREATE TABLE `__new_dna_auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`image_url` text NOT NULL,
	`dna_uid` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_dna_auth_sessions`("id", "code", "image_url", "dna_uid", "expires_at", "created_at") SELECT "id", "code", "image_url", "dna_uid", "expires_at", "created_at" FROM `dna_auth_sessions`;--> statement-breakpoint
DROP TABLE `dna_auth_sessions`;--> statement-breakpoint
ALTER TABLE `__new_dna_auth_sessions` RENAME TO `dna_auth_sessions`;--> statement-breakpoint
CREATE UNIQUE INDEX `dna_auth_sessions_code_unique` ON `dna_auth_sessions` (`code`);--> statement-breakpoint
CREATE TABLE `__new_dna_user_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dna_uid` text NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dna_user_bindings`("id", "user_id", "dna_uid", "created_at", "update_at") SELECT "id", "user_id", "dna_uid", "created_at", "update_at" FROM `dna_user_bindings`;--> statement-breakpoint
DROP TABLE `dna_user_bindings`;--> statement-breakpoint
ALTER TABLE `__new_dna_user_bindings` RENAME TO `dna_user_bindings`;--> statement-breakpoint
CREATE UNIQUE INDEX `dna_user_bindings_dna_uid_unique` ON `dna_user_bindings` (`dna_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `dna_user_binding_idx` ON `dna_user_bindings` (`user_id`,`dna_uid`);--> statement-breakpoint
CREATE TABLE `__new_dps` (
	`id` text PRIMARY KEY NOT NULL,
	`char_id` integer NOT NULL,
	`build_id` text,
	`timeline_id` text,
	`dps_value` integer NOT NULL,
	`details` text,
	`user_id` text NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dps`("id", "char_id", "build_id", "timeline_id", "dps_value", "details", "user_id", "created_at", "update_at") SELECT "id", "char_id", "build_id", "timeline_id", "dps_value", "details", "user_id", "created_at", "update_at" FROM `dps`;--> statement-breakpoint
DROP TABLE `dps`;--> statement-breakpoint
ALTER TABLE `__new_dps` RENAME TO `dps`;--> statement-breakpoint
CREATE INDEX `dps_char_id_idx` ON `dps` (`char_id`);--> statement-breakpoint
CREATE INDEX `dps_build_id_idx` ON `dps` (`build_id`);--> statement-breakpoint
CREATE INDEX `dps_timeline_id_idx` ON `dps` (`timeline_id`);--> statement-breakpoint
CREATE INDEX `dps_dps_value_idx` ON `dps` (`dps_value`);--> statement-breakpoint
CREATE TABLE `__new_guide_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`guide_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_guide_likes`("id", "guide_id", "user_id", "created_at") SELECT "id", "guide_id", "user_id", "created_at" FROM `guide_likes`;--> statement-breakpoint
DROP TABLE `guide_likes`;--> statement-breakpoint
ALTER TABLE `__new_guide_likes` RENAME TO `guide_likes`;--> statement-breakpoint
CREATE UNIQUE INDEX `guide_like_idx` ON `guide_likes` (`user_id`,`guide_id`);--> statement-breakpoint
CREATE INDEX `guide_like_guide_idx` ON `guide_likes` (`guide_id`);--> statement-breakpoint
CREATE TABLE `__new_guides` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`images` text,
	`char_id` integer,
	`user_id` text NOT NULL,
	`build_id` text,
	`views` integer,
	`likes` integer,
	`is_recommended` integer,
	`is_pinned` integer,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_guides`("id", "title", "type", "content", "images", "char_id", "user_id", "build_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at") SELECT "id", "title", "type", "content", "images", "char_id", "user_id", "build_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at" FROM `guides`;--> statement-breakpoint
DROP TABLE `guides`;--> statement-breakpoint
ALTER TABLE `__new_guides` RENAME TO `guides`;--> statement-breakpoint
CREATE INDEX `guides_type_idx` ON `guides` (`type`);--> statement-breakpoint
CREATE INDEX `guides_char_id_idx` ON `guides` (`char_id`);--> statement-breakpoint
CREATE INDEX `guides_user_id_idx` ON `guides` (`user_id`);--> statement-breakpoint
CREATE INDEX `guides_build_id_idx` ON `guides` (`build_id`);--> statement-breakpoint
CREATE TABLE `__new_logins` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`ip` text,
	`ua` text,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_logins`("id", "user_id", "ip", "ua", "created_at") SELECT "id", "user_id", "ip", "ua", "created_at" FROM `logins`;--> statement-breakpoint
DROP TABLE `logins`;--> statement-breakpoint
ALTER TABLE `__new_logins` RENAME TO `logins`;--> statement-breakpoint
CREATE TABLE `__new_missions_ingame` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`server` text NOT NULL,
	`missions` text NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_missions_ingame`("id", "server", "missions", "created_at") SELECT "id", "server", "missions", "created_at" FROM `missions_ingame`;--> statement-breakpoint
DROP TABLE `missions_ingame`;--> statement-breakpoint
ALTER TABLE `__new_missions_ingame` RENAME TO `missions_ingame`;--> statement-breakpoint
CREATE INDEX `missions_ingame_server_idx` ON `missions_ingame` (`server`);--> statement-breakpoint
CREATE TABLE `__new_msgs` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`reply_to_msg_id` text,
	`reply_to_user_id` text,
	`content` text NOT NULL,
	`edited` integer,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reply_to_msg_id`) REFERENCES `msgs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reply_to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_msgs`("id", "room_id", "user_id", "reply_to_msg_id", "reply_to_user_id", "content", "edited", "created_at", "update_at") SELECT "id", "room_id", "user_id", "reply_to_msg_id", "reply_to_user_id", "content", "edited", "created_at", "update_at" FROM `msgs`;--> statement-breakpoint
DROP TABLE `msgs`;--> statement-breakpoint
ALTER TABLE `__new_msgs` RENAME TO `msgs`;--> statement-breakpoint
CREATE INDEX `msg_room_id_idx` ON `msgs` (`room_id`);--> statement-breakpoint
CREATE TABLE `__new_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`is_read` integer,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_notifications`("id", "user_id", "type", "content", "is_read", "created_at", "update_at") SELECT "id", "user_id", "type", "content", "is_read", "created_at", "update_at" FROM `notifications`;--> statement-breakpoint
DROP TABLE `notifications`;--> statement-breakpoint
ALTER TABLE `__new_notifications` RENAME TO `notifications`;--> statement-breakpoint
CREATE TABLE `__new_password_resets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_password_resets`("id", "user_id", "token", "expires_at", "created_at") SELECT "id", "user_id", "token", "expires_at", "created_at" FROM `password_resets`;--> statement-breakpoint
DROP TABLE `password_resets`;--> statement-breakpoint
ALTER TABLE `__new_password_resets` RENAME TO `password_resets`;--> statement-breakpoint
CREATE UNIQUE INDEX `password_resets_user_id_unique` ON `password_resets` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_passwords` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`hash` text NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_passwords`("id", "user_id", "hash", "created_at", "update_at") SELECT "id", "user_id", "hash", "created_at", "update_at" FROM `passwords`;--> statement-breakpoint
DROP TABLE `passwords`;--> statement-breakpoint
ALTER TABLE `__new_passwords` RENAME TO `passwords`;--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`msg_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`msg_id`) REFERENCES `msgs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_reactions`("id", "msg_id", "content", "created_at") SELECT "id", "msg_id", "content", "created_at" FROM `reactions`;--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;--> statement-breakpoint
CREATE TABLE `__new_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text,
	`owner_id` text NOT NULL,
	`max_users` integer,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_rooms`("id", "name", "type", "owner_id", "max_users", "created_at", "update_at") SELECT "id", "name", "type", "owner_id", "max_users", "created_at", "update_at" FROM `rooms`;--> statement-breakpoint
DROP TABLE `rooms`;--> statement-breakpoint
ALTER TABLE `__new_rooms` RENAME TO `rooms`;--> statement-breakpoint
CREATE TABLE `__new_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`repeat_type` text,
	`repeat_interval` integer,
	`repeat_count` integer,
	`user_id` text NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_schedules`("id", "name", "start_time", "end_time", "repeat_type", "repeat_interval", "repeat_count", "user_id", "created_at", "update_at") SELECT "id", "name", "start_time", "end_time", "repeat_type", "repeat_interval", "repeat_count", "user_id", "created_at", "update_at" FROM `schedules`;--> statement-breakpoint
DROP TABLE `schedules`;--> statement-breakpoint
ALTER TABLE `__new_schedules` RENAME TO `schedules`;--> statement-breakpoint
CREATE TABLE `__new_script_categories` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer,
	`update_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_script_categories`("id", "name", "description", "created_at", "update_at") SELECT "id", "name", "description", "created_at", "update_at" FROM `script_categories`;--> statement-breakpoint
DROP TABLE `script_categories`;--> statement-breakpoint
ALTER TABLE `__new_script_categories` RENAME TO `script_categories`;--> statement-breakpoint
CREATE UNIQUE INDEX `script_categories_name_idx` ON `script_categories` (`name`);--> statement-breakpoint
CREATE TABLE `__new_script_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`script_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_script_likes`("id", "script_id", "user_id", "created_at") SELECT "id", "script_id", "user_id", "created_at" FROM `script_likes`;--> statement-breakpoint
DROP TABLE `script_likes`;--> statement-breakpoint
ALTER TABLE `__new_script_likes` RENAME TO `script_likes`;--> statement-breakpoint
CREATE UNIQUE INDEX `script_like_idx` ON `script_likes` (`user_id`,`script_id`);--> statement-breakpoint
CREATE INDEX `script_like_script_idx` ON `script_likes` (`script_id`);--> statement-breakpoint
CREATE TABLE `__new_scripts` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`desc` text,
	`content` text NOT NULL,
	`category` text NOT NULL,
	`user_id` text NOT NULL,
	`views` integer DEFAULT 0,
	`likes` integer DEFAULT 0,
	`is_recommended` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_scripts`("id", "title", "desc", "content", "category", "user_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at") SELECT "id", "title", "desc", "content", "category", "user_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at" FROM `scripts`;--> statement-breakpoint
DROP TABLE `scripts`;--> statement-breakpoint
ALTER TABLE `__new_scripts` RENAME TO `scripts`;--> statement-breakpoint
CREATE INDEX `scripts_category_idx` ON `scripts` (`category`);--> statement-breakpoint
CREATE INDEX `scripts_user_id_idx` ON `scripts` (`user_id`);--> statement-breakpoint
CREATE INDEX `scripts_is_recommended_idx` ON `scripts` (`is_recommended`);--> statement-breakpoint
CREATE TABLE `__new_shop_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_type` text NOT NULL,
	`reward_key` text NOT NULL,
	`reward_name` text NOT NULL,
	`display_class` text,
	`display_css` text,
	`created_at` integer,
	`update_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_shop_assets`("id", "reward_type", "reward_key", "reward_name", "display_class", "display_css", "created_at", "update_at") SELECT "id", "reward_type", "reward_key", "reward_name", "display_class", "display_css", "created_at", "update_at" FROM `shop_assets`;--> statement-breakpoint
DROP TABLE `shop_assets`;--> statement-breakpoint
ALTER TABLE `__new_shop_assets` RENAME TO `shop_assets`;--> statement-breakpoint
CREATE UNIQUE INDEX `shop_assets_reward_key_unique_idx` ON `shop_assets` (`reward_type`,`reward_key`);--> statement-breakpoint
CREATE INDEX `shop_assets_reward_type_idx` ON `shop_assets` (`reward_type`);--> statement-breakpoint
CREATE TABLE `__new_shop_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`asset_id` text NOT NULL,
	`points_cost` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer NOT NULL,
	`start_time` integer,
	`end_time` integer,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`asset_id`) REFERENCES `shop_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shop_products`("id", "name", "description", "asset_id", "points_cost", "sort_order", "is_active", "start_time", "end_time", "created_at", "update_at") SELECT "id", "name", "description", "asset_id", "points_cost", "sort_order", "is_active", "start_time", "end_time", "created_at", "update_at" FROM `shop_products`;--> statement-breakpoint
DROP TABLE `shop_products`;--> statement-breakpoint
ALTER TABLE `__new_shop_products` RENAME TO `shop_products`;--> statement-breakpoint
CREATE INDEX `shop_products_asset_idx` ON `shop_products` (`asset_id`);--> statement-breakpoint
CREATE INDEX `shop_products_active_sort_idx` ON `shop_products` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `__new_shop_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`points_cost` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `shop_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_shop_redemptions`("id", "user_id", "product_id", "asset_id", "points_cost", "created_at") SELECT "id", "user_id", "product_id", "asset_id", "points_cost", "created_at" FROM `shop_redemptions`;--> statement-breakpoint
DROP TABLE `shop_redemptions`;--> statement-breakpoint
ALTER TABLE `__new_shop_redemptions` RENAME TO `shop_redemptions`;--> statement-breakpoint
CREATE INDEX `shop_redemptions_user_idx` ON `shop_redemptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `shop_redemptions_product_idx` ON `shop_redemptions` (`product_id`);--> statement-breakpoint
CREATE INDEX `shop_redemptions_asset_idx` ON `shop_redemptions` (`asset_id`);--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`desc` text,
	`start_time` integer,
	`end_time` integer,
	`max_user` integer NOT NULL,
	`max_age` integer,
	`user_list` text NOT NULL,
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`room_id`) REFERENCES `rooms`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("id", "name", "desc", "start_time", "end_time", "max_user", "max_age", "user_list", "room_id", "user_id", "created_at", "update_at") SELECT "id", "name", "desc", "start_time", "end_time", "max_user", "max_age", "user_list", "room_id", "user_id", "created_at", "update_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
CREATE TABLE `__new_timeline_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`timeline_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_timeline_likes`("id", "timeline_id", "user_id", "created_at") SELECT "id", "timeline_id", "user_id", "created_at" FROM `timeline_likes`;--> statement-breakpoint
DROP TABLE `timeline_likes`;--> statement-breakpoint
ALTER TABLE `__new_timeline_likes` RENAME TO `timeline_likes`;--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_like_idx` ON `timeline_likes` (`user_id`,`timeline_id`);--> statement-breakpoint
CREATE INDEX `timeline_like_timeline_idx` ON `timeline_likes` (`timeline_id`);--> statement-breakpoint
CREATE TABLE `__new_timelines` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`char_id` integer NOT NULL,
	`char_name` text NOT NULL,
	`tracks` text NOT NULL,
	`items` text NOT NULL,
	`user_id` text NOT NULL,
	`views` integer DEFAULT 0,
	`likes` integer DEFAULT 0,
	`is_recommended` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_timelines`("id", "title", "char_id", "char_name", "tracks", "items", "user_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at") SELECT "id", "title", "char_id", "char_name", "tracks", "items", "user_id", "views", "likes", "is_recommended", "is_pinned", "created_at", "update_at" FROM `timelines`;--> statement-breakpoint
DROP TABLE `timelines`;--> statement-breakpoint
ALTER TABLE `__new_timelines` RENAME TO `timelines`;--> statement-breakpoint
CREATE INDEX `timelines_char_id_idx` ON `timelines` (`char_id`);--> statement-breakpoint
CREATE INDEX `timelines_user_id_idx` ON `timelines` (`user_id`);--> statement-breakpoint
CREATE INDEX `timelines_is_recommended_idx` ON `timelines` (`is_recommended`);--> statement-breakpoint
CREATE TABLE `__new_todo_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_todo_completions`("id", "todo_id", "user_id", "completed_at") SELECT "id", "todo_id", "user_id", "completed_at" FROM `todo_completions`;--> statement-breakpoint
DROP TABLE `todo_completions`;--> statement-breakpoint
ALTER TABLE `__new_todo_completions` RENAME TO `todo_completions`;--> statement-breakpoint
CREATE UNIQUE INDEX `todo_completion_idx` ON `todo_completions` (`todo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `__new_todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`desc` text,
	`start_time` integer,
	`end_time` integer,
	`type` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_todos`("id", "title", "desc", "start_time", "end_time", "type", "user_id", "created_at", "update_at") SELECT "id", "title", "desc", "start_time", "end_time", "type", "user_id", "created_at", "update_at" FROM `todos`;--> statement-breakpoint
DROP TABLE `todos`;--> statement-breakpoint
ALTER TABLE `__new_todos` RENAME TO `todos`;--> statement-breakpoint
CREATE INDEX `todos_user_id_idx` ON `todos` (`user_id`);--> statement-breakpoint
CREATE INDEX `todos_type_idx` ON `todos` (`type`);--> statement-breakpoint
CREATE TABLE `__new_user_experience_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`date_key` text NOT NULL,
	`awarded_exp` integer NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_experience_rewards`("id", "user_id", "source", "date_key", "awarded_exp", "created_at") SELECT "id", "user_id", "source", "date_key", "awarded_exp", "created_at" FROM `user_experience_rewards`;--> statement-breakpoint
DROP TABLE `user_experience_rewards`;--> statement-breakpoint
ALTER TABLE `__new_user_experience_rewards` RENAME TO `user_experience_rewards`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_experience_reward_unique_idx` ON `user_experience_rewards` (`user_id`,`source`,`date_key`);--> statement-breakpoint
CREATE INDEX `user_experience_reward_user_idx` ON `user_experience_rewards` (`user_id`);--> statement-breakpoint
CREATE TABLE `__new_user_reactions` (
	`user_id` text NOT NULL,
	`reaction_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`reaction_id`) REFERENCES `reactions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_reactions`("user_id", "reaction_id", "created_at") SELECT "user_id", "reaction_id", "created_at" FROM `user_reactions`;--> statement-breakpoint
DROP TABLE `user_reactions`;--> statement-breakpoint
ALTER TABLE `__new_user_reactions` RENAME TO `user_reactions`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_reaction_idx` ON `user_reactions` (`user_id`,`reaction_id`);--> statement-breakpoint
CREATE TABLE `__new_user_shop_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `shop_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_user_shop_items`("id", "user_id", "asset_id", "created_at") SELECT "id", "user_id", "asset_id", "created_at" FROM `user_shop_items`;--> statement-breakpoint
DROP TABLE `user_shop_items`;--> statement-breakpoint
ALTER TABLE `__new_user_shop_items` RENAME TO `user_shop_items`;--> statement-breakpoint
CREATE UNIQUE INDEX `user_shop_item_unique_idx` ON `user_shop_items` (`user_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `user_shop_item_user_idx` ON `user_shop_items` (`user_id`);--> statement-breakpoint
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
	`created_at` integer,
	`update_at` integer
);
--> statement-breakpoint
INSERT INTO `__new_users`("id", "email", "name", "qq", "pic", "uid", "roles", "experience", "points", "level", "selected_title_asset_id", "selected_name_card_asset_id", "created_at", "update_at") SELECT "id", "email", "name", "qq", "pic", "uid", "roles", "experience", "points", "level", "selected_title_asset_id", "selected_name_card_asset_id", "created_at", "update_at" FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `email_idx` ON `users` (`email`);
--> statement-breakpoint
UPDATE `abyss_usage_role_participants`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `abyss_usage_submissions`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `abyss_usage_weapon_participants`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `activities_ingame`
SET `start_time` = CASE
        WHEN typeof(`start_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`start_time`,1,4) AS integer), CAST(substr(`start_time`,6, instr(substr(`start_time`,6), '/') - 1) AS integer), CAST(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1, instr(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`start_time`, ' ') > 0 THEN substr(`start_time`, instr(`start_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `start_time`
    END,
    `end_time` = CASE
        WHEN typeof(`end_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`end_time`,1,4) AS integer), CAST(substr(`end_time`,6, instr(substr(`end_time`,6), '/') - 1) AS integer), CAST(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1, instr(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`end_time`, ' ') > 0 THEN substr(`end_time`, instr(`end_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `end_time`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `build_likes`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `builds`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `dna_auth_sessions`
SET `expires_at` = CASE
        WHEN typeof(`expires_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`expires_at`,1,4) AS integer), CAST(substr(`expires_at`,6, instr(substr(`expires_at`,6), '/') - 1) AS integer), CAST(substr(substr(`expires_at`,6), instr(substr(`expires_at`,6), '/') + 1, instr(substr(substr(`expires_at`,6), instr(substr(`expires_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`expires_at`, ' ') > 0 THEN substr(`expires_at`, instr(`expires_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `expires_at`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END;--> statement-breakpoint
UPDATE `dna_user_bindings`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `dps`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `guide_likes`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `guides`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `logins`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `missions_ingame`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `notifications`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `msgs`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `password_resets`
SET `expires_at` = CASE
        WHEN typeof(`expires_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`expires_at`,1,4) AS integer), CAST(substr(`expires_at`,6, instr(substr(`expires_at`,6), '/') - 1) AS integer), CAST(substr(substr(`expires_at`,6), instr(substr(`expires_at`,6), '/') + 1, instr(substr(substr(`expires_at`,6), instr(substr(`expires_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`expires_at`, ' ') > 0 THEN substr(`expires_at`, instr(`expires_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `expires_at`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END;--> statement-breakpoint
UPDATE `passwords`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `reactions`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `rooms`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `schedules`
SET `start_time` = CASE
        WHEN typeof(`start_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`start_time`,1,4) AS integer), CAST(substr(`start_time`,6, instr(substr(`start_time`,6), '/') - 1) AS integer), CAST(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1, instr(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`start_time`, ' ') > 0 THEN substr(`start_time`, instr(`start_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `start_time`
    END,
    `end_time` = CASE
        WHEN typeof(`end_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`end_time`,1,4) AS integer), CAST(substr(`end_time`,6, instr(substr(`end_time`,6), '/') - 1) AS integer), CAST(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1, instr(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`end_time`, ' ') > 0 THEN substr(`end_time`, instr(`end_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `end_time`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `script_categories`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `script_likes`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `scripts`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `shop_assets`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `shop_products`
SET `start_time` = CASE
        WHEN typeof(`start_time`) = 'text' AND instr(`start_time`, '/') > 0 THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`start_time`,1,4) AS integer), CAST(substr(`start_time`,6, instr(substr(`start_time`,6), '/') - 1) AS integer), CAST(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1, instr(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`start_time`, ' ') > 0 THEN substr(`start_time`, instr(`start_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        WHEN typeof(`start_time`) = 'text' THEN COALESCE(CAST(strftime('%s', replace(`start_time`, 'T', ' ')) AS integer) * 1000, 0)
        ELSE `start_time`
    END,
    `end_time` = CASE
        WHEN typeof(`end_time`) = 'text' AND instr(`end_time`, '/') > 0 THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`end_time`,1,4) AS integer), CAST(substr(`end_time`,6, instr(substr(`end_time`,6), '/') - 1) AS integer), CAST(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1, instr(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`end_time`, ' ') > 0 THEN substr(`end_time`, instr(`end_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        WHEN typeof(`end_time`) = 'text' THEN COALESCE(CAST(strftime('%s', replace(`end_time`, 'T', ' ')) AS integer) * 1000, 0)
        ELSE `end_time`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `shop_redemptions`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `tasks`
SET `start_time` = CASE
        WHEN typeof(`start_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`start_time`,1,4) AS integer), CAST(substr(`start_time`,6, instr(substr(`start_time`,6), '/') - 1) AS integer), CAST(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1, instr(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`start_time`, ' ') > 0 THEN substr(`start_time`, instr(`start_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `start_time`
    END,
    `end_time` = CASE
        WHEN typeof(`end_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`end_time`,1,4) AS integer), CAST(substr(`end_time`,6, instr(substr(`end_time`,6), '/') - 1) AS integer), CAST(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1, instr(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`end_time`, ' ') > 0 THEN substr(`end_time`, instr(`end_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `end_time`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `timeline_likes`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `timelines`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `todos`
SET `start_time` = CASE
        WHEN typeof(`start_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`start_time`,1,4) AS integer), CAST(substr(`start_time`,6, instr(substr(`start_time`,6), '/') - 1) AS integer), CAST(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1, instr(substr(substr(`start_time`,6), instr(substr(`start_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`start_time`, ' ') > 0 THEN substr(`start_time`, instr(`start_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `start_time`
    END,
    `end_time` = CASE
        WHEN typeof(`end_time`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`end_time`,1,4) AS integer), CAST(substr(`end_time`,6, instr(substr(`end_time`,6), '/') - 1) AS integer), CAST(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1, instr(substr(substr(`end_time`,6), instr(substr(`end_time`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`end_time`, ' ') > 0 THEN substr(`end_time`, instr(`end_time`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `end_time`
    END,
    `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;--> statement-breakpoint
UPDATE `user_experience_rewards`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `user_reactions`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `user_shop_items`
SET `created_at` = CASE
    WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
    ELSE `created_at`
END;--> statement-breakpoint
UPDATE `users`
SET `created_at` = CASE
        WHEN typeof(`created_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`created_at`,1,4) AS integer), CAST(substr(`created_at`,6, instr(substr(`created_at`,6), '/') - 1) AS integer), CAST(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1, instr(substr(substr(`created_at`,6), instr(substr(`created_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`created_at`, ' ') > 0 THEN substr(`created_at`, instr(`created_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `created_at`
    END,
    `update_at` = CASE
        WHEN typeof(`update_at`) = 'text' THEN COALESCE(CAST(strftime('%s', printf('%04d-%02d-%02d %s', CAST(substr(`update_at`,1,4) AS integer), CAST(substr(`update_at`,6, instr(substr(`update_at`,6), '/') - 1) AS integer), CAST(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1, instr(substr(substr(`update_at`,6), instr(substr(`update_at`,6), '/') + 1), ' ') - 1) AS integer), CASE WHEN instr(`update_at`, ' ') > 0 THEN substr(`update_at`, instr(`update_at`, ' ') + 1) ELSE '00:00:00' END)) AS integer) * 1000, 0)
        ELSE `update_at`
    END;
