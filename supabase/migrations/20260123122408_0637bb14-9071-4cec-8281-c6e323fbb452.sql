-- Backfill NULL topic_ids for feed/play/story pages using case-insensitive matching
UPDATE site_visits sv
SET topic_id = t.id
FROM topics t
WHERE sv.topic_id IS NULL
  AND sv.page_path ~ '^/(feed|play)/[^/]+'
  AND LOWER(REGEXP_REPLACE(sv.page_path, '^/(feed|play)/([^/]+).*', '\2')) = LOWER(t.slug);