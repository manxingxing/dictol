DROP INDEX `dictionary_entry_dictionary_id_idx`;--> statement-breakpoint
CREATE INDEX `dictionary_entry_dictionary_id_normalized_word_idx` ON `dictionary_entry` (`dictionary_id`,`normalized_word`);