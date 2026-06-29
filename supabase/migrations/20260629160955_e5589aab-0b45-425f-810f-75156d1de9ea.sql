UPDATE public.content_sources
SET feed_url = 'https://bournefreelive.co.uk/feed/',
    updated_at = now()
WHERE id = '5c226b7e-300d-4cd6-b856-b391d3c36178'
  AND feed_url = 'https://bournefreelive.co.uk';