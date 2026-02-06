
-- Link content sources to topics via the topic_sources junction table
INSERT INTO public.topic_sources (topic_id, source_id, is_active)
VALUES
  -- Culture
  ('dbfbd79a-14fe-4c92-9da6-3376b74530f9', '949b5aa2-c961-41b6-8d89-f4e23f74a588', true),
  ('dbfbd79a-14fe-4c92-9da6-3376b74530f9', 'b759ffe4-4cbb-4f13-81c7-80a9127494c1', true),
  ('dbfbd79a-14fe-4c92-9da6-3376b74530f9', '1d8c6bb6-2abb-4d5d-a0d2-ce3998f3565e', true),
  -- Environment
  ('b2e42a78-e1b2-416c-9885-c28bd1e5c95c', '9aa383ec-7625-4f0d-9a22-0bc689ee5060', true),
  ('b2e42a78-e1b2-416c-9885-c28bd1e5c95c', '84640a0c-7aae-4c14-9bab-15072dfdad6a', true),
  ('b2e42a78-e1b2-416c-9885-c28bd1e5c95c', 'c40c78aa-e778-4896-9806-f79ec150df66', true),
  -- Community
  ('643f3b98-4327-446f-b442-8185537e508c', '3d30d6fb-ce1d-4f5f-b8e6-22af6cd4cc32', true),
  ('643f3b98-4327-446f-b442-8185537e508c', '1b25daa5-179a-4fd9-b30c-0f4732801891', true),
  ('643f3b98-4327-446f-b442-8185537e508c', '25ba988d-44db-48e8-9971-06ef8ad09c97', true);
