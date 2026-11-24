ALTER TABLE public.events ADD COLUMN IF NOT EXISTS run_start date, ADD COLUMN IF NOT EXISTS source_subtitle text;
UPDATE public.feed_editorial_profiles p
SET caption_templates = (
  SELECT jsonb_object_agg(k, (
    SELECT jsonb_agg(CASE WHEN line #>> '{}' = '{day} {date}[ · {time}]' THEN to_jsonb('{when}[ · {time}]'::text) ELSE line END)
    FROM jsonb_array_elements(v) line))
  FROM jsonb_each(p.caption_templates) AS t(k, v))
WHERE p.caption_templates::text LIKE '%{day} {date}%';