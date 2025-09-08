-- Update Brighton topic with proper negative keywords and competing regions
UPDATE topics 
SET 
  negative_keywords = ARRAY['eastbourne', 'hastings', 'lewes', 'worthing', 'seaford', 'chichester', 'crawley', 'horsham'],
  competing_regions = ARRAY['eastbourne', 'hastings', 'lewes', 'worthing', 'seaford', 'chichester', 'crawley', 'horsham'],
  updated_at = now()
WHERE name = 'Brighton' AND is_active = true;