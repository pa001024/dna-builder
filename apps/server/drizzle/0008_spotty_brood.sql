CREATE TABLE `dps` (
	`id` text PRIMARY KEY NOT NULL,
	`char_id` integer NOT NULL,
	`build_id` text,
	`timeline_id` text,
	`dps_value` integer NOT NULL,
	`details` text,
	`user_id` text NOT NULL,
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`timeline_id`) REFERENCES `timelines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dps_char_id_idx` ON `dps` (`char_id`);--> statement-breakpoint
CREATE INDEX `dps_build_id_idx` ON `dps` (`build_id`);--> statement-breakpoint
CREATE INDEX `dps_timeline_id_idx` ON `dps` (`timeline_id`);--> statement-breakpoint
CREATE INDEX `dps_dps_value_idx` ON `dps` (`dps_value`);