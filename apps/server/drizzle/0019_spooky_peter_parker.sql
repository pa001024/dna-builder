CREATE TABLE `user_experience_rewards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`source` text NOT NULL,
	`date_key` text NOT NULL,
	`awarded_exp` integer NOT NULL,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_experience_reward_unique_idx` ON `user_experience_rewards` (`user_id`,`source`,`date_key`);--> statement-breakpoint
CREATE INDEX `user_experience_reward_user_idx` ON `user_experience_rewards` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `experience` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `level` integer NOT NULL DEFAULT 1;
