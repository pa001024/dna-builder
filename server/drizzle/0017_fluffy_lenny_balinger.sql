ALTER TABLE `msgs` ADD `reply_to_msg_id` text REFERENCES msgs(id);--> statement-breakpoint
ALTER TABLE `msgs` ADD `reply_to_user_id` text REFERENCES users(id);