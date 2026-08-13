PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `dictionary_entry_new` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dictionary_id` integer NOT NULL,
	`dictionary_file_id` integer NOT NULL,
	`word` text NOT NULL,
	`normalized_word` text NOT NULL,
	`record_start_offset` integer NOT NULL,
	`record_end_offset` integer NOT NULL,
	FOREIGN KEY (`dictionary_id`) REFERENCES `dictionary`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dictionary_file_id`) REFERENCES `dictionary_file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `dictionary_entry_new` (`id`, `dictionary_id`, `dictionary_file_id`, `word`, `normalized_word`, `record_start_offset`, `record_end_offset`)
SELECT `id`, `dictionary_id`, `dictionary_file_id`, `word`, `normalized_word`, `record_start_offset`, `record_end_offset`
FROM `dictionary_entry`;
--> statement-breakpoint
DROP TABLE `dictionary_entry`;
--> statement-breakpoint
ALTER TABLE `dictionary_entry_new` RENAME TO `dictionary_entry`;
--> statement-breakpoint
CREATE INDEX `dictionary_entry_dictionary_id_idx` ON `dictionary_entry` (`dictionary_id`);
--> statement-breakpoint
CREATE INDEX `dictionary_entry_file_id_idx` ON `dictionary_entry` (`dictionary_file_id`);
--> statement-breakpoint
CREATE INDEX `dictionary_entry_normalized_word_idx` ON `dictionary_entry` (`normalized_word`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
