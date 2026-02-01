CREATE TABLE `script_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`script_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text,
	FOREIGN KEY (`script_id`) REFERENCES `scripts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `script_like_idx` ON `script_likes` (`user_id`,`script_id`);--> statement-breakpoint
CREATE INDEX `script_like_script_idx` ON `script_likes` (`script_id`);--> statement-breakpoint
CREATE TABLE `scripts` (
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
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `scripts_category_idx` ON `scripts` (`category`);--> statement-breakpoint
CREATE INDEX `scripts_user_id_idx` ON `scripts` (`user_id`);--> statement-breakpoint
CREATE INDEX `scripts_is_recommended_idx` ON `scripts` (`is_recommended`);