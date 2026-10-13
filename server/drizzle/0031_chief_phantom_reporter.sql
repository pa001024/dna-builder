CREATE TABLE `ai_recharge_codes` (
	`code` text PRIMARY KEY NOT NULL,
	`amount_micros` integer NOT NULL,
	`batch_id` text NOT NULL,
	`status` text NOT NULL,
	`expires_at` integer,
	`redeemed_by` text,
	`redeemed_at` integer,
	`created_by` text,
	`created_at` integer,
	FOREIGN KEY (`redeemed_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ai_recharge_codes_batch_idx` ON `ai_recharge_codes` (`batch_id`);--> statement-breakpoint
CREATE INDEX `ai_recharge_codes_status_idx` ON `ai_recharge_codes` (`status`);--> statement-breakpoint
CREATE TABLE `ai_recharge_credits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance_micros` integer NOT NULL,
	`total_redeemed_micros` integer NOT NULL,
	`total_spent_micros` integer NOT NULL,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
