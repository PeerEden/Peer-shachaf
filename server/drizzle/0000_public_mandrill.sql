CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` integer,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`before_json` text,
	`after_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `fixtures` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`home_team_id` integer NOT NULL,
	`away_team_id` integer NOT NULL,
	`kickoff_at` integer NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`home_score` integer,
	`away_score` integer,
	`live_minute` text,
	`is_completion` integer DEFAULT false NOT NULL,
	`prediction_open_at` integer,
	`finalized_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`home_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`away_team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `fixtures_round_idx` ON `fixtures` (`round_id`);--> statement-breakpoint
CREATE INDEX `fixtures_kickoff_idx` ON `fixtures` (`kickoff_at`);--> statement-breakpoint
CREATE INDEX `fixtures_season_status_idx` ON `fixtures` (`season_id`,`status`);--> statement-breakpoint
CREATE TABLE `league_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`league_name` text DEFAULT '0 מושג בכדורגל' NOT NULL,
	`invite_code` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `notification_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_key` text NOT NULL,
	`user_id` integer,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_log_event_key_unique` ON `notification_log` (`event_key`);--> statement-breakpoint
CREATE INDEX `notification_log_created_idx` ON `notification_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `prediction_scores` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`fixture_id` integer NOT NULL,
	`round_id` integer NOT NULL,
	`season_id` integer NOT NULL,
	`points` integer NOT NULL,
	`is_exact` integer NOT NULL,
	`is_outcome` integer NOT NULL,
	`is_completion` integer DEFAULT false NOT NULL,
	`computed_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `prediction_scores_user_fixture_idx` ON `prediction_scores` (`user_id`,`fixture_id`);--> statement-breakpoint
CREATE INDEX `prediction_scores_season_user_idx` ON `prediction_scores` (`season_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `prediction_scores_round_idx` ON `prediction_scores` (`round_id`);--> statement-breakpoint
CREATE TABLE `predictions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`fixture_id` integer NOT NULL,
	`home_pred` integer NOT NULL,
	`away_pred` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`fixture_id`) REFERENCES `fixtures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `predictions_user_fixture_idx` ON `predictions` (`user_id`,`fixture_id`);--> statement-breakpoint
CREATE INDEX `predictions_fixture_idx` ON `predictions` (`fixture_id`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`last_success_at` integer,
	`fail_count` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_subscriptions_user_idx` ON `push_subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `round_titles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`round_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`title_code` text NOT NULL,
	`awarded_at` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_titles_round_user_title_idx` ON `round_titles` (`round_id`,`user_id`,`title_code`);--> statement-breakpoint
CREATE TABLE `round_user_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`round_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`points` integer NOT NULL,
	`exact_count` integer NOT NULL,
	`outcome_count` integer NOT NULL,
	`rank_in_round` integer NOT NULL,
	`is_round_winner` integer NOT NULL,
	`season_total_after` integer NOT NULL,
	`rank_after` integer NOT NULL,
	`rank_before` integer,
	`movement` integer,
	FOREIGN KEY (`round_id`) REFERENCES `rounds`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `round_user_stats_round_user_idx` ON `round_user_stats` (`round_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `rounds` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`number` integer NOT NULL,
	`name` text NOT NULL,
	`phase` text DEFAULT 'regular' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`lock_at` integer,
	`opened_at` integer,
	`closed_at` integer,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rounds_season_number_phase_idx` ON `rounds` (`season_id`,`number`,`phase`);--> statement-breakpoint
CREATE INDEX `rounds_season_status_idx` ON `rounds` (`season_id`,`status`);--> statement-breakpoint
CREATE TABLE `season_honors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`season_id` integer NOT NULL,
	`user_id` integer,
	`display_name` text NOT NULL,
	`title_code` text NOT NULL,
	`value` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`season_id`) REFERENCES `seasons`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`archived_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `seasons_name_unique` ON `seasons` (`name`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`token_hash` text NOT NULL,
	`user_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`user_agent` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_hash_unique` ON `sessions` (`token_hash`);--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE INDEX `sessions_expires_idx` ON `sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`color` text DEFAULT '#22c55e' NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_name_unique` ON `teams` (`name`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`display_name` text NOT NULL,
	`phone` text NOT NULL,
	`avatar_path` text,
	`role` text DEFAULT 'USER' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_phone_unique` ON `users` (`phone`);