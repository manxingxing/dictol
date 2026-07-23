CREATE TABLE "dictionary_entry" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "dictionary_entry_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"dictionary_id" bigint NOT NULL,
	"dictionary_file_id" bigint NOT NULL,
	"word" text NOT NULL,
	"normalized_word" text NOT NULL,
	"record_start_offset" bigint NOT NULL,
	"record_end_offset" bigint NOT NULL,
	"key_block_idx" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dictionary_entry" ADD CONSTRAINT "dictionary_entry_dictionary_id_dictionary_id_fk" FOREIGN KEY ("dictionary_id") REFERENCES "public"."dictionary"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dictionary_entry" ADD CONSTRAINT "dictionary_entry_dictionary_file_id_dictionary_file_id_fk" FOREIGN KEY ("dictionary_file_id") REFERENCES "public"."dictionary_file"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dictionary_entry_dictionary_id_idx" ON "dictionary_entry" USING btree ("dictionary_id");--> statement-breakpoint
CREATE INDEX "dictionary_entry_file_id_idx" ON "dictionary_entry" USING btree ("dictionary_file_id");--> statement-breakpoint
CREATE INDEX "dictionary_entry_normalized_word_idx" ON "dictionary_entry" USING btree ("normalized_word");