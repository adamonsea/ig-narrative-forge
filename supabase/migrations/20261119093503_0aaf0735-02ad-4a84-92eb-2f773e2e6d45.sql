ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS use_publisher_photos boolean NOT NULL DEFAULT true;
ALTER TABLE public.articles ADD COLUMN IF NOT EXISTS image_credit text;
ALTER TABLE public.shared_article_content ADD COLUMN IF NOT EXISTS image_credit text;
ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS cover_photo_credit text;
COMMENT ON COLUMN public.topics.use_publisher_photos IS 'Owner switch: when false, new stories never take the publisher photo as cover (illustrations only).';
COMMENT ON COLUMN public.stories.cover_photo_credit IS 'Credit text found on the source site for a publisher-photo cover; null when none given.';