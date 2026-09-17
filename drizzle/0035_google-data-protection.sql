CREATE TABLE `google_data_protection` (
  `id` text PRIMARY KEY NOT NULL,
  `created_at` integer NOT NULL
);
--> statement-breakpoint
-- Protection is recorded by Google access and explicit derived-content flows.
-- Existing recipes/chats are not evidence of Google access. Do not backfill them.
CREATE TABLE `google_data_route_audit` (
  `id` text PRIMARY KEY NOT NULL,
  `model_id` text NOT NULL,
  `endpoint` text NOT NULL,
  `requested_at` integer NOT NULL
);
