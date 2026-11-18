ALTER TABLE public.stories DROP CONSTRAINT stories_status_check;
ALTER TABLE public.stories ADD CONSTRAINT stories_status_check
  CHECK (status = ANY (ARRAY['draft'::text, 'processing'::text, 'ready'::text, 'published'::text, 'archived'::text]));