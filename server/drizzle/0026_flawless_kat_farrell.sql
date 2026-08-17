CREATE TABLE `dye_plan_likes` (
	`id` text PRIMARY KEY NOT NULL,
	`dye_plan_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`dye_plan_id`) REFERENCES `dye_plans`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dye_plan_like_idx` ON `dye_plan_likes` (`user_id`,`dye_plan_id`);--> statement-breakpoint
CREATE INDEX `dye_plan_like_plan_idx` ON `dye_plan_likes` (`dye_plan_id`);--> statement-breakpoint
CREATE TABLE `dye_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`desc` text,
	`type` text DEFAULT 'Char' NOT NULL,
	`skin_id` integer NOT NULL,
	`color_ids` text NOT NULL,
	`image_url` text,
	`is_original` integer DEFAULT true NOT NULL,
	`source` text,
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
CREATE INDEX `dye_plans_user_id_idx` ON `dye_plans` (`user_id`);--> statement-breakpoint
CREATE INDEX `dye_plans_skin_id_idx` ON `dye_plans` (`skin_id`);--> statement-breakpoint
CREATE INDEX `dye_plans_type_idx` ON `dye_plans` (`type`);--> statement-breakpoint
CREATE INDEX `dye_plans_update_at_idx` ON `dye_plans` (`update_at`);--> statement-breakpoint
CREATE INDEX `dye_plans_views_idx` ON `dye_plans` (`views`);