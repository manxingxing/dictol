PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_query_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`term` text NOT NULL,
	`normalized_term` text NOT NULL,
	`query_count` integer DEFAULT 1 NOT NULL,
	`last_queried_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `__new_query_history`("id", "term", "normalized_term", "query_count", "last_queried_at")
SELECT h."id", de."word", lower(de."word"), 1, h."queried_at"
FROM `query_history` h
INNER JOIN `dictionary_entry` de ON de."id" = h."dictionary_entry_id";--> statement-breakpoint
DROP TABLE `query_history`;--> statement-breakpoint
ALTER TABLE `__new_query_history` RENAME TO `query_history`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `query_history_normalized_term_unique` ON `query_history` (`normalized_term`);--> statement-breakpoint
CREATE INDEX `query_history_last_queried_at_idx` ON `query_history` (`last_queried_at`);
