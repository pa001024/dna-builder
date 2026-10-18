DROP INDEX `builds_char_id_views_update_at_idx`;--> statement-breakpoint
DROP INDEX `builds_views_update_at_idx`;--> statement-breakpoint
CREATE INDEX `builds_char_id_views_idx` ON `builds` (`char_id`,`views`);--> statement-breakpoint
CREATE INDEX `builds_views_idx` ON `builds` (`views`);