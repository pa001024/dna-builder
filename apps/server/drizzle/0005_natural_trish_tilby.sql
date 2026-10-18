CREATE TABLE `todo_completions` (
	`id` text PRIMARY KEY NOT NULL,
	`todo_id` text NOT NULL,
	`user_id` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `todo_completion_idx` ON `todo_completions` (`todo_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `todos` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`desc` text,
	`start_time` text,
	`end_time` text,
	`type` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `todos_user_id_idx` ON `todos` (`user_id`);--> statement-breakpoint
CREATE INDEX `todos_type_idx` ON `todos` (`type`);