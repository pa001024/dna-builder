ALTER TABLE `builds` ADD `build_type` text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
CREATE INDEX `builds_build_type_idx` ON `builds` (`build_type`);--> statement-breakpoint
UPDATE `builds` SET `build_type` = 'transcend'
WHERE CASE WHEN json_valid(`char_settings`) THEN json_extract(`char_settings`, '$.transcend.enabled') ELSE 0 END = 1;
