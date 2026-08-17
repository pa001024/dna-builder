CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`target_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `comments_target_id_idx` ON `comments` (`target_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `comments_user_id_idx` ON `comments` (`user_id`);