ALTER TABLE `builds` ADD `desc` text;--> statement-breakpoint
ALTER TABLE `guides` ADD `build_id` text REFERENCES builds(id);--> statement-breakpoint
CREATE INDEX `guides_build_id_idx` ON `guides` (`build_id`);--> statement-breakpoint
ALTER TABLE `guides` DROP COLUMN `char_settings`;