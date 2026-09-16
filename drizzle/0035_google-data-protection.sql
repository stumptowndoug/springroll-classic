CREATE TABLE `google_data_protection` (
  `id` text PRIMARY KEY NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
-- Legacy content has no provenance. Conservatively protect existing local work
-- including content whose original Google account has already been removed.
INSERT INTO `google_data_protection` (`id`, `created_at`)
SELECT 'chat:' || id, updated_at FROM chat_sessions;
--> statement-breakpoint
INSERT INTO `google_data_protection` (`id`, `created_at`)
SELECT 'task:' || id, updated_at FROM tasks;
--> statement-breakpoint
CREATE TABLE `google_data_route_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `model_id` text NOT NULL,
  `endpoint` text NOT NULL,
  `requested_at` integer NOT NULL
);
