CREATE TABLE `bug_ai_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text,
	`input_hash` text NOT NULL,
	`model_provider` text,
	`harness_version` text,
	`prompt_hash` text,
	`tool_manifest_hash` text,
	`schema_version` integer,
	`result` text,
	`token_usage` text,
	`cost_micros` integer DEFAULT 0 NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	`error` text,
	FOREIGN KEY (`job_id`) REFERENCES `bug_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bug_ai_runs_job_idx` ON `bug_ai_runs` (`job_id`);--> statement-breakpoint
CREATE INDEX `bug_ai_runs_input_hash_idx` ON `bug_ai_runs` (`input_hash`);--> statement-breakpoint
CREATE TABLE `bug_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`submission_version_id` text NOT NULL,
	`private_object_key` text NOT NULL,
	`sha256` text NOT NULL,
	`actual_mime` text NOT NULL,
	`bytes` integer NOT NULL,
	`dimensions` text,
	`scan_state` text DEFAULT 'pending' NOT NULL,
	`redaction_state` text DEFAULT 'pending' NOT NULL,
	`public_derivative_key` text,
	`publication_policy` text DEFAULT 'internal_only' NOT NULL,
	`created_at` integer
);
--> statement-breakpoint
CREATE INDEX `bug_assets_version_idx` ON `bug_assets` (`submission_version_id`);--> statement-breakpoint
CREATE INDEX `bug_assets_sha_idx` ON `bug_assets` (`sha256`);--> statement-breakpoint
CREATE INDEX `bug_assets_scan_idx` ON `bug_assets` (`scan_state`);--> statement-breakpoint
CREATE TABLE `bug_discussion_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`bug_id` text NOT NULL,
	`source` text DEFAULT 'local' NOT NULL,
	`source_actor_id` text,
	`display_author` text,
	`body_safe` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`feedback_id` text,
	`deleted_at` integer,
	`export_policy` text DEFAULT 'internal_only' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`feedback_id`) REFERENCES `bug_feedback`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bug_discussion_bug_time_idx` ON `bug_discussion_entries` (`bug_id`,`created_at`,`id`);--> statement-breakpoint
CREATE TABLE `bug_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`bug_id` text,
	`submission_id` text,
	`kind` text NOT NULL,
	`actor` text,
	`payload_safe` text,
	`entity_version` integer,
	`created_at` integer,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`submission_id`) REFERENCES `bug_submissions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bug_events_bug_idx` ON `bug_events` (`bug_id`);--> statement-breakpoint
CREATE INDEX `bug_events_submission_idx` ON `bug_events` (`submission_id`);--> statement-breakpoint
CREATE INDEX `bug_events_kind_idx` ON `bug_events` (`kind`);--> statement-breakpoint
CREATE INDEX `bug_events_created_idx` ON `bug_events` (`created_at`);--> statement-breakpoint
CREATE TABLE `bug_feedback` (
	`id` text PRIMARY KEY NOT NULL,
	`bug_id` text NOT NULL,
	`submission_version_id` text NOT NULL,
	`feedback_kind` text NOT NULL,
	`reproduction_result` text,
	`game_version` text,
	`source_actor` text NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bug_feedback_bug_idx` ON `bug_feedback` (`bug_id`);--> statement-breakpoint
CREATE INDEX `bug_feedback_version_idx` ON `bug_feedback` (`submission_version_id`);--> statement-breakpoint
CREATE TABLE `bug_idempotency_keys` (
	`actor_key` text NOT NULL,
	`op` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`result_id` text,
	`created_at` integer,
	PRIMARY KEY(`actor_key`, `op`, `key`)
);
--> statement-breakpoint
CREATE TABLE `bug_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`input_revision` integer DEFAULT 0 NOT NULL,
	`idempotency_key` text NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`eligible_at` integer NOT NULL,
	`priority_class` text DEFAULT 'normal' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`lease_owner` text,
	`lease_until` integer,
	`fencing_token` integer DEFAULT 0 NOT NULL,
	`input_hash` text,
	`result_ref` text,
	`last_error` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_jobs_idempotency_uq` ON `bug_jobs` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `bug_jobs_state_eligible_idx` ON `bug_jobs` (`state`,`eligible_at`,`priority_class`);--> statement-breakpoint
CREATE INDEX `bug_jobs_lease_idx` ON `bug_jobs` (`lease_until`);--> statement-breakpoint
CREATE TABLE `bug_merge_events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_bug_ids` text DEFAULT '[]' NOT NULL,
	`target_bug_id` text NOT NULL,
	`decision_evidence` text,
	`before_versions` text,
	`moved_occurrence_ids` text DEFAULT '[]' NOT NULL,
	`actor` text,
	`reverted_at` integer,
	`created_at` integer,
	FOREIGN KEY (`target_bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bug_merge_events_target_idx` ON `bug_merge_events` (`target_bug_id`);--> statement-breakpoint
CREATE INDEX `bug_merge_events_reverted_idx` ON `bug_merge_events` (`reverted_at`);--> statement-breakpoint
CREATE TABLE `bug_occurrences` (
	`id` text PRIMARY KEY NOT NULL,
	`bug_id` text NOT NULL,
	`submission_version_id` text NOT NULL,
	`part_id` text NOT NULL,
	`evidence_refs` text DEFAULT '[]' NOT NULL,
	`reported_environment` text,
	`source_actor` text NOT NULL,
	`relation` text DEFAULT 'original' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_occurrences_version_part_uq` ON `bug_occurrences` (`submission_version_id`,`part_id`);--> statement-breakpoint
CREATE INDEX `bug_occurrences_bug_idx` ON `bug_occurrences` (`bug_id`);--> statement-breakpoint
CREATE INDEX `bug_occurrences_version_idx` ON `bug_occurrences` (`submission_version_id`);--> statement-breakpoint
CREATE TABLE `bug_outbox` (
	`event_id` text NOT NULL,
	`operation` text NOT NULL,
	`target_mapping` text NOT NULL,
	`source_revision` integer,
	`payload_hash` text,
	`state` text DEFAULT 'queued' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` integer,
	`remote_result` text,
	`last_error` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_outbox_event_operation_target_uq` ON `bug_outbox` (`event_id`,`operation`,`target_mapping`);--> statement-breakpoint
CREATE INDEX `bug_outbox_state_next_idx` ON `bug_outbox` (`state`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `bug_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`source_bug_id` text NOT NULL,
	`target_bug_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`symmetry_key` text,
	`evidence_refs` text DEFAULT '[]' NOT NULL,
	`origin` text DEFAULT 'user' NOT NULL,
	`actor` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	`deleted_at` integer,
	`created_at` integer,
	FOREIGN KEY (`source_bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bug_relations_symmetry_uq` ON `bug_relations` (`symmetry_key`) WHERE "bug_relations"."symmetry_key" is not null;--> statement-breakpoint
CREATE INDEX `bug_relations_pair_idx` ON `bug_relations` (`source_bug_id`,`target_bug_id`,`relation_type`,`state`);--> statement-breakpoint
CREATE INDEX `bug_relations_target_idx` ON `bug_relations` (`target_bug_id`,`relation_type`,`state`);--> statement-breakpoint
CREATE TABLE `bug_submission_versions` (
	`submission_id` text NOT NULL,
	`revision` integer NOT NULL,
	`raw_text_private` text,
	`content_sha256` text NOT NULL,
	`context` text,
	`publication_policy` text DEFAULT 'internal_only' NOT NULL,
	`created_at` integer,
	PRIMARY KEY(`submission_id`, `revision`),
	FOREIGN KEY (`submission_id`) REFERENCES `bug_submissions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bug_submissions` (
	`id` text PRIMARY KEY NOT NULL,
	`game_id` text NOT NULL,
	`user_id` text,
	`anon_actor_id` text,
	`receipt_digest` text,
	`state` text DEFAULT 'received' NOT NULL,
	`current_revision` integer DEFAULT 0 NOT NULL,
	`created_at` integer,
	`retention_until` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bug_submissions_game_state_idx` ON `bug_submissions` (`game_id`,`state`);--> statement-breakpoint
CREATE INDEX `bug_submissions_user_idx` ON `bug_submissions` (`user_id`);--> statement-breakpoint
CREATE INDEX `bug_submissions_anon_actor_idx` ON `bug_submissions` (`anon_actor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bug_submissions_receipt_uq` ON `bug_submissions` (`receipt_digest`);--> statement-breakpoint
CREATE TABLE `bug_subscriptions` (
	`actor_key` text NOT NULL,
	`bug_id` text NOT NULL,
	`channels` text DEFAULT '[]' NOT NULL,
	`preferences` text,
	`created_at` integer,
	PRIMARY KEY(`actor_key`, `bug_id`),
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `bug_tag_assignments` (
	`bug_id` text NOT NULL,
	`tag_key` text NOT NULL,
	`source` text NOT NULL,
	`actor` text,
	`evidence_refs` text DEFAULT '[]' NOT NULL,
	`entity_version` integer DEFAULT 1 NOT NULL,
	`event_id` text,
	`removed_at` integer,
	`created_at` integer,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tag_key`) REFERENCES `bug_tag_definitions`(`tag_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bug_tag_assignments_bug_tag_idx` ON `bug_tag_assignments` (`bug_id`,`tag_key`,`removed_at`);--> statement-breakpoint
CREATE INDEX `bug_tag_assignments_tag_idx` ON `bug_tag_assignments` (`tag_key`);--> statement-breakpoint
CREATE TABLE `bug_tag_definitions` (
	`tag_key` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`exclusive_group` text,
	`display_i18n_key` text NOT NULL,
	`semantic_description` text,
	`allowed_sources` text DEFAULT '[]' NOT NULL,
	`evidence_policy` text,
	`registry_version` integer DEFAULT 1 NOT NULL,
	`retired_at` integer
);
--> statement-breakpoint
CREATE TABLE `bug_vote_intents` (
	`user_id` text NOT NULL,
	`original_bug_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` integer,
	PRIMARY KEY(`user_id`, `original_bug_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`original_bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `bug_vote_intents_bug_active_idx` ON `bug_vote_intents` (`original_bug_id`,`active`);--> statement-breakpoint
CREATE TABLE `bugs` (
	`id` text PRIMARY KEY NOT NULL,
	`display_key` text NOT NULL,
	`game_id` text NOT NULL,
	`primary_category` text DEFAULT 'other' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`title` text NOT NULL,
	`summary` text NOT NULL,
	`expected` text,
	`actual` text,
	`steps` text DEFAULT '[]' NOT NULL,
	`environment` text,
	`status` text DEFAULT 'untriaged' NOT NULL,
	`resolution` text,
	`fix_stage` text,
	`fix_stage_source` text,
	`fix_evidence_status` text,
	`tag_version` integer DEFAULT 0 NOT NULL,
	`visibility` text DEFAULT 'public' NOT NULL,
	`suggested_severity` text,
	`confirmed_severity` text,
	`severity_source` text,
	`version` integer DEFAULT 1 NOT NULL,
	`duplicate_of` text,
	`fixed_version` text,
	`created_at` integer,
	FOREIGN KEY (`duplicate_of`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `bugs_game_vis_status_cat_idx` ON `bugs` (`game_id`,`visibility`,`status`,`primary_category`);--> statement-breakpoint
CREATE UNIQUE INDEX `bugs_display_key_uq` ON `bugs` (`display_key`);--> statement-breakpoint
CREATE INDEX `bugs_duplicate_of_idx` ON `bugs` (`duplicate_of`);--> statement-breakpoint
CREATE TABLE `github_comment_links` (
	`discussion_entry_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`comment_id` text NOT NULL,
	`source_origin` text NOT NULL,
	`last_local_revision` integer,
	`last_remote_hash` text,
	`deleted_at` integer,
	FOREIGN KEY (`discussion_entry_id`) REFERENCES `bug_discussion_entries`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_comment_links_repo_comment_uq` ON `github_comment_links` (`repository_id`,`comment_id`);--> statement-breakpoint
CREATE INDEX `github_comment_links_entry_idx` ON `github_comment_links` (`discussion_entry_id`);--> statement-breakpoint
CREATE TABLE `github_issue_links` (
	`id` text PRIMARY KEY NOT NULL,
	`bug_id` text NOT NULL,
	`repository_id` text NOT NULL,
	`issue_id` text NOT NULL,
	`issue_node_id` text,
	`issue_number` integer NOT NULL,
	`html_url` text NOT NULL,
	`role` text DEFAULT 'primary' NOT NULL,
	`sync_state` text DEFAULT 'pending' NOT NULL,
	`remote_updated_at` integer,
	`remote_state` text,
	`remote_state_reason` text,
	`remote_duplicate_target` text,
	`created_at` integer,
	FOREIGN KEY (`bug_id`) REFERENCES `bugs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `github_issue_links_primary_uq` ON `github_issue_links` (`bug_id`,`repository_id`) WHERE "github_issue_links"."role" = 'primary';--> statement-breakpoint
CREATE INDEX `github_issue_links_repo_issue_idx` ON `github_issue_links` (`repository_id`,`issue_id`);--> statement-breakpoint
CREATE INDEX `github_issue_links_bug_role_idx` ON `github_issue_links` (`bug_id`,`role`);--> statement-breakpoint
CREATE TABLE `github_label_bindings` (
	`repository_id` text NOT NULL,
	`label_name` text NOT NULL,
	`tag_key` text NOT NULL,
	`registry_version` integer DEFAULT 1 NOT NULL,
	`state` text DEFAULT 'active' NOT NULL,
	PRIMARY KEY(`repository_id`, `label_name`),
	FOREIGN KEY (`tag_key`) REFERENCES `bug_tag_definitions`(`tag_key`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `github_label_bindings_tag_idx` ON `github_label_bindings` (`tag_key`);--> statement-breakpoint
CREATE TABLE `github_tag_sync_state` (
	`issue_link_id` text NOT NULL,
	`group_key` text NOT NULL,
	`last_synced_tag_keys` text DEFAULT '[]' NOT NULL,
	`local_tag_version` integer DEFAULT 0 NOT NULL,
	`pending_event_id` text,
	`conflict` integer DEFAULT false NOT NULL,
	`verified_at` integer,
	PRIMARY KEY(`issue_link_id`, `group_key`),
	FOREIGN KEY (`issue_link_id`) REFERENCES `github_issue_links`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `github_webhook_inbox` (
	`delivery_id` text PRIMARY KEY NOT NULL,
	`event` text NOT NULL,
	`action` text,
	`repository_id` text,
	`installation_id` text,
	`payload_private` text NOT NULL,
	`processing_state` text DEFAULT 'pending' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`received_at` integer NOT NULL,
	`last_error` text
);
--> statement-breakpoint
CREATE INDEX `github_webhook_inbox_state_idx` ON `github_webhook_inbox` (`processing_state`,`received_at`);