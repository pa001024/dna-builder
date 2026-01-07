CREATE TABLE `dna_auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`image_url` text NOT NULL,
	`dna_uid` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dna_auth_sessions_code_unique` ON `dna_auth_sessions` (`code`);--> statement-breakpoint
CREATE TABLE `dna_user_bindings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`dna_uid` text NOT NULL,
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dna_user_bindings_dna_uid_unique` ON `dna_user_bindings` (`dna_uid`);--> statement-breakpoint
CREATE UNIQUE INDEX `dna_user_binding_idx` ON `dna_user_bindings` (`user_id`,`dna_uid`);