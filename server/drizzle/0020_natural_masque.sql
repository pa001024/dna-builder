CREATE TABLE `shop_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`reward_type` text NOT NULL,
	`reward_key` text NOT NULL,
	`reward_name` text NOT NULL,
	`display_class` text,
	`display_css` text,
	`created_at` text,
	`update_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shop_assets_reward_key_unique_idx` ON `shop_assets` (`reward_type`,`reward_key`);--> statement-breakpoint
CREATE INDEX `shop_assets_reward_type_idx` ON `shop_assets` (`reward_type`);--> statement-breakpoint
CREATE TABLE `shop_products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`asset_id` text NOT NULL,
	`points_cost` integer NOT NULL,
	`sort_order` integer NOT NULL,
	`is_active` integer NOT NULL,
	`start_time` text,
	`end_time` text,
	`created_at` text,
	`update_at` text,
	FOREIGN KEY (`asset_id`) REFERENCES `shop_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shop_products_asset_idx` ON `shop_products` (`asset_id`);--> statement-breakpoint
CREATE INDEX `shop_products_active_sort_idx` ON `shop_products` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `shop_redemptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`product_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`points_cost` integer NOT NULL,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `shop_products`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `shop_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `shop_redemptions_user_idx` ON `shop_redemptions` (`user_id`);--> statement-breakpoint
CREATE INDEX `shop_redemptions_product_idx` ON `shop_redemptions` (`product_id`);--> statement-breakpoint
CREATE INDEX `shop_redemptions_asset_idx` ON `shop_redemptions` (`asset_id`);--> statement-breakpoint
CREATE TABLE `user_shop_items` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`created_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `shop_assets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_shop_item_unique_idx` ON `user_shop_items` (`user_id`,`asset_id`);--> statement-breakpoint
CREATE INDEX `user_shop_item_user_idx` ON `user_shop_items` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `points` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `users` ADD `selected_title_asset_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `selected_name_card_asset_id` text;
