CREATE TABLE `wordbook` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`is_default` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wordbook_name_unique` ON `wordbook` (`name`);--> statement-breakpoint
CREATE INDEX `wordbook_default_idx` ON `wordbook` (`is_default`);--> statement-breakpoint
CREATE UNIQUE INDEX `wordbook_single_default_idx` ON `wordbook` (`is_default`) WHERE `is_default` = 1;--> statement-breakpoint
INSERT INTO `wordbook` (`name`, `is_default`)
SELECT '默认', 1
WHERE NOT EXISTS (SELECT 1 FROM `wordbook` WHERE `is_default` = 1);--> statement-breakpoint
CREATE TABLE `wordbook_word` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`wordbook_id` integer NOT NULL,
	`word` text NOT NULL,
	`normalized_word` text NOT NULL,
	`star` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updated_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`wordbook_id`) REFERENCES `wordbook`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "wordbook_word_star_check" CHECK("wordbook_word"."star" between 0 and 5)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wordbook_word_normalized_word_unique` ON `wordbook_word` (`normalized_word`);--> statement-breakpoint
CREATE INDEX `wordbook_word_wordbook_id_idx` ON `wordbook_word` (`wordbook_id`);--> statement-breakpoint
CREATE INDEX `wordbook_word_created_at_idx` ON `wordbook_word` (`created_at`);
