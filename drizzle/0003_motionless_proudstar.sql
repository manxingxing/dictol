ALTER TABLE `dictionary` ADD `sort_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `dictionary`
SET `sort_order` = (
	SELECT count(*)
	FROM `dictionary` AS `other`
	WHERE `other`.`created_at` > `dictionary`.`created_at`
	   OR (`other`.`created_at` = `dictionary`.`created_at` AND `other`.`id` > `dictionary`.`id`)
);--> statement-breakpoint
CREATE INDEX `dictionary_sort_order_idx` ON `dictionary` (`sort_order`);
