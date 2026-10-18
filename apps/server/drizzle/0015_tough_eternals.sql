DROP INDEX `builds_char_id_update_at_created_at_idx`;--> statement-breakpoint
DROP INDEX `builds_update_at_created_at_idx`;--> statement-breakpoint
DROP INDEX `builds_views_likes_idx`;--> statement-breakpoint
DROP INDEX `builds_is_recommended_created_at_idx`;--> statement-breakpoint
CREATE INDEX `builds_update_at_idx` ON `builds` (`update_at`);