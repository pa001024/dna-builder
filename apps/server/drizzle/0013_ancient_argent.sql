UPDATE `builds` SET `update_at` = `created_at` WHERE `update_at` IS NULL;--> statement-breakpoint
CREATE INDEX `builds_update_at_created_at_idx` ON `builds` (`update_at`,`created_at`);--> statement-breakpoint
CREATE INDEX `builds_views_update_at_idx` ON `builds` (`views`,`update_at`);
