CREATE INDEX `builds_char_id_update_at_idx` ON `builds` (`char_id`,`update_at`);--> statement-breakpoint
CREATE INDEX `builds_char_id_views_update_at_idx` ON `builds` (`char_id`,`views`,`update_at`);--> statement-breakpoint
CREATE INDEX `builds_views_likes_idx` ON `builds` (`views`,`likes`);--> statement-breakpoint
CREATE INDEX `builds_is_recommended_created_at_idx` ON `builds` (`is_recommended`,`created_at`);