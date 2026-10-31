CREATE TABLE `graph_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`graph_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`graph_id`) REFERENCES `graphs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `graph_like_idx` ON `graph_likes` (`user_id`,`graph_id`);--> statement-breakpoint
CREATE INDEX `graph_like_graph_idx` ON `graph_likes` (`graph_id`);--> statement-breakpoint
CREATE TABLE `graphs` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`desc` text,
	`graph_data` text NOT NULL,
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
CREATE INDEX `graphs_user_id_idx` ON `graphs` (`user_id`);--> statement-breakpoint
CREATE INDEX `graphs_is_recommended_idx` ON `graphs` (`is_recommended`);--> statement-breakpoint
CREATE INDEX `graphs_update_at_idx` ON `graphs` (`update_at`);--> statement-breakpoint
CREATE INDEX `graphs_views_idx` ON `graphs` (`views`);