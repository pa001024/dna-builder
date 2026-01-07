CREATE TABLE `guide_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`guide_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text,
	FOREIGN KEY (`guide_id`) REFERENCES `guides`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `guide_like_idx` ON `guide_likes` (`user_id`,`guide_id`);--> statement-breakpoint
CREATE INDEX `guide_like_guide_idx` ON `guide_likes` (`guide_id`);--> statement-breakpoint
CREATE TABLE `guides` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`type` text NOT NULL,
	`content` text NOT NULL,
	`images` text,
	`char_id` integer,
	`user_id` text NOT NULL,
	`char_settings` text,
	`views` integer,
	`likes` integer,
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `guides_type_idx` ON `guides` (`type`);--> statement-breakpoint
CREATE INDEX `guides_char_id_idx` ON `guides` (`char_id`);--> statement-breakpoint
CREATE INDEX `guides_user_id_idx` ON `guides` (`user_id`);