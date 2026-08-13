-- Seed the initial online dictionaries once. After this migration has run, these
-- rows behave like user-created dictionaries and can be permanently deleted.
WITH `presets` (`name`, `favicon_url`, `url_template`, `preset_order`) AS (
	VALUES
		('汉典', 'https://zdic.net/favicon.ico', 'https://zdic.net/hans/%s', 0),
		('Vocabulary', 'https://www.vocabulary.com/favicon.ico', 'https://www.vocabulary.com/dictionary/%s', 1),
		('Google 翻译', 'https://translate.google.com/favicon.ico', 'https://translate.google.com/?hl=zh-cn&sl=auto&tl=zh-CN&text=%s&op=translate', 2),
		('有道词典', 'https://shared-https.ydstatic.com/images/favicon.ico', 'https://www.youdao.com/result?word=%s&lang=en', 3),
		('Wikipedia', 'https://en.wikipedia.org/favicon.ico', 'https://en.wikipedia.org/wiki/%s', 4)
)
INSERT INTO `online_dictionary` (`name`, `favicon_url`, `url_template`, `sort_order`)
SELECT
	`presets`.`name`,
	`presets`.`favicon_url`,
	`presets`.`url_template`,
	(SELECT coalesce(max(`sort_order`), -1) + 1 FROM `online_dictionary`) + `presets`.`preset_order`
FROM `presets`
WHERE NOT EXISTS (
	SELECT 1
	FROM `online_dictionary` AS `existing`
	WHERE `existing`.`url_template` = `presets`.`url_template`
)
ORDER BY `presets`.`preset_order`;
