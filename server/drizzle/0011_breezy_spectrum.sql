CREATE TABLE `activities_ingame` (
	`id` integer NOT NULL,
	`server` text NOT NULL,
	`post_id` text,
	`start_time` integer NOT NULL,
	`end_time` integer NOT NULL,
	`name` text NOT NULL,
	`icon` text NOT NULL,
	`desc` text NOT NULL,
	`created_at` text,
	`update_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activities_ingame_server_id_idx` ON `activities_ingame` (`server`,`id`);--> statement-breakpoint
CREATE INDEX `activities_ingame_server_start_time_idx` ON `activities_ingame` (`server`,`start_time`);