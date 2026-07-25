CREATE TABLE `query_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dictionary_entry_id` integer NOT NULL,
	`queried_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`dictionary_entry_id`) REFERENCES `dictionary_entry`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `query_history_dictionary_entry_id_unique` ON `query_history` (`dictionary_entry_id`);--> statement-breakpoint
CREATE INDEX `query_history_queried_at_idx` ON `query_history` (`queried_at`);