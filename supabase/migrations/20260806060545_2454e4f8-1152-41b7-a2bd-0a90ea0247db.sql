-- de-dupe any existing multiple rows per waitlist entry, keeping the most complete/latest
DELETE FROM public.waitlist_responses a
USING public.waitlist_responses b
WHERE a.is_preview = false
  AND b.is_preview = false
  AND a.waitlist_id IS NOT NULL
  AND a.waitlist_id = b.waitlist_id
  AND (
    (a.completed_at IS NULL AND b.completed_at IS NOT NULL)
    OR (((a.completed_at IS NULL) = (b.completed_at IS NULL)) AND a.updated_at < b.updated_at)
    OR (((a.completed_at IS NULL) = (b.completed_at IS NULL)) AND a.updated_at = b.updated_at AND a.id < b.id)
  );

CREATE UNIQUE INDEX IF NOT EXISTS waitlist_responses_one_per_signup
  ON public.waitlist_responses (waitlist_id)
  WHERE is_preview = false AND waitlist_id IS NOT NULL;