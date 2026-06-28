CREATE TABLE `ranking_list_items` (
	`id` text PRIMARY KEY NOT NULL,
	`ranking_list_id` text NOT NULL,
	`char_id` integer NOT NULL,
	`build_id` text NOT NULL,
	`sort_order` integer,
	`created_at` integer,
	`update_at` integer,
	FOREIGN KEY (`ranking_list_id`) REFERENCES `ranking_lists`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`build_id`) REFERENCES `builds`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ranking_list_items_ranking_list_id_idx` ON `ranking_list_items` (`ranking_list_id`);--> statement-breakpoint
CREATE INDEX `ranking_list_items_char_id_idx` ON `ranking_list_items` (`char_id`);--> statement-breakpoint
CREATE INDEX `ranking_list_items_build_id_idx` ON `ranking_list_items` (`build_id`);--> statement-breakpoint
CREATE INDEX `ranking_list_items_sort_order_idx` ON `ranking_list_items` (`sort_order`);--> statement-breakpoint
CREATE TABLE `ranking_lists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`desc` text,
	`created_at` integer,
	`update_at` integer
);
--> statement-breakpoint
CREATE INDEX `ranking_lists_name_idx` ON `ranking_lists` (`name`);--> statement-breakpoint
CREATE INDEX `ranking_lists_update_at_idx` ON `ranking_lists` (`update_at`);