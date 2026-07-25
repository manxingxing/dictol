CREATE TABLE `dictionary` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`record_count` integer,
	`dict_path` text,
	`status` text DEFAULT 'importing' NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	CONSTRAINT "dictionary_status_check" CHECK("dictionary"."status" in ('pending', 'importing', 'ready', 'error'))
);
--> statement-breakpoint
CREATE INDEX `dictionary_status_idx` ON `dictionary` (`status`);--> statement-breakpoint
CREATE TABLE `dictionary_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dictionary_id` integer NOT NULL,
	`dictionary_file_id` integer NOT NULL,
	`word` text NOT NULL,
	`normalized_word` text NOT NULL,
	`record_start_offset` integer NOT NULL,
	`record_end_offset` integer NOT NULL,
	`key_block_idx` integer NOT NULL,
	FOREIGN KEY (`dictionary_id`) REFERENCES `dictionary`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`dictionary_file_id`) REFERENCES `dictionary_file`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `dictionary_entry_dictionary_id_idx` ON `dictionary_entry` (`dictionary_id`);--> statement-breakpoint
CREATE INDEX `dictionary_entry_file_id_idx` ON `dictionary_entry` (`dictionary_file_id`);--> statement-breakpoint
CREATE INDEX `dictionary_entry_normalized_word_idx` ON `dictionary_entry` (`normalized_word`);--> statement-breakpoint
CREATE TABLE `dictionary_file` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`dictionary_id` integer NOT NULL,
	`file_name` text NOT NULL,
	`file_path` text NOT NULL,
	`file_type` text NOT NULL,
	`file_size` integer,
	`checksum` text,
	`format_version` text,
	`is_encrypted` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`dictionary_id`) REFERENCES `dictionary`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "dictionary_file_type_check" CHECK("dictionary_file"."file_type" in ('mdx', 'mdd'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dictionary_file_file_path_unique` ON `dictionary_file` (`file_path`);--> statement-breakpoint
CREATE INDEX `dictionary_file_dictionary_id_idx` ON `dictionary_file` (`dictionary_id`);--> statement-breakpoint
CREATE INDEX `dictionary_file_type_idx` ON `dictionary_file` (`file_type`);