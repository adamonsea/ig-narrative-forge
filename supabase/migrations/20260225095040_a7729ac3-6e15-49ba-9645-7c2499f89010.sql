-- Unsuppress and restore this specific Eastbourne article to arrivals
DELETE FROM public.discarded_articles
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
  AND normalized_url = 'eastbournereporter.co.uk/brett-wright-eastbourne-green-party';

UPDATE public.topic_articles
SET processing_status = 'new', updated_at = now()
WHERE id = '397019a5-47a1-40cc-a473-01bc6b6a6124'
  AND topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6';