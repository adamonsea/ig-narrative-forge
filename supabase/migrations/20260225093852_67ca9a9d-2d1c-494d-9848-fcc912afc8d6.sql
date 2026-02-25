
-- Reset the "Turning Green" article from 'discarded' back to 'new'
UPDATE topic_articles SET processing_status = 'new' WHERE id = '397019a5-47a1-40cc-a473-01bc6b6a6124';

-- Reset all topic_articles for Eastbourne stories in 'ready' status back to 'new'
-- so they reappear in arrivals
UPDATE topic_articles SET processing_status = 'new'
WHERE id IN (
  '3fe34fde-82a9-4a43-bd84-ea9a39041a9e',
  '5bc1cb1a-b139-47e5-b44a-842b0827c6b0',
  'd01fa696-8d5c-44ed-967a-2bcdd496f69b',
  '204afe5f-3a2d-42bc-b4c7-6db82b0f67ea',
  '46cbb3cc-ccd7-4528-a149-b9c00e9cf8e3',
  '8d22412b-b3db-427d-9fdb-3e93b6662c8e'
);

-- Also delete the orphaned stories in 'ready' status so they don't block re-processing
-- (the articles will come back as fresh arrivals)
DELETE FROM stories WHERE id IN (
  'a607c32a-edf9-441d-90fc-680d4bb6507e',
  '257e980f-c1b5-4b3d-9bb7-0b72a49d52c7',
  'a816e0c7-0587-4e61-96e9-578c81d0bb33',
  'fab942ac-9522-49fe-bf89-ee8be2e63e9f',
  '0ec36405-710c-4c04-b1c3-03eedcee2374',
  'b36262f0-a154-479b-b200-dda374736492'
);
