CREATE TABLE `build_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`build_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `build_like_idx` ON `build_likes` (`user_id`,`build_id`);--> statement-breakpoint
CREATE INDEX `build_like_build_idx` ON `build_likes` (`build_id`);--> statement-breakpoint
CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`char_id` integer NOT NULL,
	`char_settings` text NOT NULL,
	`user_id` text NOT NULL,
	`views` integer DEFAULT 0,
	`likes` integer DEFAULT 0,
	`is_recommended` integer DEFAULT false,
	`is_pinned` integer DEFAULT false,
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `builds_char_id_idx` ON `builds` (`char_id`);--> statement-breakpoint
CREATE INDEX `builds_user_id_idx` ON `builds` (`user_id`);--> statement-breakpoint
CREATE INDEX `builds_is_recommended_idx` ON `builds` (`is_recommended`);--> statement-breakpoint
CREATE TABLE `timeline_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`timeline_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `timeline_like_idx` ON `timeline_likes` (`user_id`,`timeline_id`);--> statement-breakpoint
CREATE INDEX `timeline_like_timeline_idx` ON `timeline_likes` (`timeline_id`);--> statement-breakpoint
CREATE TABLE `timelines` (
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
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `timelines_char_id_idx` ON `timelines` (`char_id`);--> statement-breakpoint
CREATE INDEX `timelines_user_id_idx` ON `timelines` (`user_id`);--> statement-breakpoint
CREATE INDEX `timelines_is_recommended_idx` ON `timelines` (`is_recommended`);