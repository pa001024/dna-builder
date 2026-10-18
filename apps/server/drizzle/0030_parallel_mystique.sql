CREATE TABLE `ai_usage_daily` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`cache_hit_tokens` integer NOT NULL,
	`cache_miss_tokens` integer NOT NULL,
	`output_tokens` integer NOT NULL,
	`cost_micros` integer NOT NULL,
	`requests` integer NOT NULL,
	`created_at` integer,
	`update_at` integer,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
