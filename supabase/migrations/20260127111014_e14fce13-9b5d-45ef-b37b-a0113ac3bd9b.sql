-- Clean up all content from archived topics (full dependency order)
-- Use a CTE to get all topic_article IDs first, then delete in proper order

-- Step 1: Delete slides (references stories)
DELETE FROM slides 
WHERE story_id IN (
  SELECT s.id FROM stories s
  JOIN topic_articles ta ON s.topic_article_id = ta.id
  WHERE ta.topic_id IN (
    'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
    '7c38403c-6fb0-4eab-831e-de3b0817025e',
    '973deca3-17f3-4e5a-899a-fd4f26b90260',
    '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
    '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
    'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
    'a375d196-16bf-4b46-846e-6cf8067de0f2',
    '0dc1da67-2975-4a42-af18-556ecb286398',
    'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
  )
);

-- Step 2: Delete posts (references stories)
DELETE FROM posts 
WHERE story_id IN (
  SELECT s.id FROM stories s
  JOIN topic_articles ta ON s.topic_article_id = ta.id
  WHERE ta.topic_id IN (
    'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
    '7c38403c-6fb0-4eab-831e-de3b0817025e',
    '973deca3-17f3-4e5a-899a-fd4f26b90260',
    '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
    '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
    'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
    'a375d196-16bf-4b46-846e-6cf8067de0f2',
    '0dc1da67-2975-4a42-af18-556ecb286398',
    'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
  )
);

-- Step 3: Delete stories (references topic_articles)
DELETE FROM stories 
WHERE topic_article_id IN (
  SELECT id FROM topic_articles WHERE topic_id IN (
    'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
    '7c38403c-6fb0-4eab-831e-de3b0817025e',
    '973deca3-17f3-4e5a-899a-fd4f26b90260',
    '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
    '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
    'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
    'a375d196-16bf-4b46-846e-6cf8067de0f2',
    '0dc1da67-2975-4a42-af18-556ecb286398',
    'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
  )
);

-- Step 4: Delete content_generation_queue (references topic_articles)
DELETE FROM content_generation_queue 
WHERE topic_article_id IN (
  SELECT id FROM topic_articles WHERE topic_id IN (
    'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
    '7c38403c-6fb0-4eab-831e-de3b0817025e',
    '973deca3-17f3-4e5a-899a-fd4f26b90260',
    '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
    '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
    'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
    'a375d196-16bf-4b46-846e-6cf8067de0f2',
    '0dc1da67-2975-4a42-af18-556ecb286398',
    'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
  )
);

-- Step 5: Delete topic_articles
DELETE FROM topic_articles 
WHERE topic_id IN (
  'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
  '7c38403c-6fb0-4eab-831e-de3b0817025e',
  '973deca3-17f3-4e5a-899a-fd4f26b90260',
  '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
  '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
  'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
  'a375d196-16bf-4b46-846e-6cf8067de0f2',
  '0dc1da67-2975-4a42-af18-556ecb286398',
  'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
);

-- Step 6: Delete articles
DELETE FROM articles 
WHERE topic_id IN (
  'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
  '7c38403c-6fb0-4eab-831e-de3b0817025e',
  '973deca3-17f3-4e5a-899a-fd4f26b90260',
  '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
  '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
  'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
  'a375d196-16bf-4b46-846e-6cf8067de0f2',
  '0dc1da67-2975-4a42-af18-556ecb286398',
  'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
);

-- Step 7: Clean up daily_content_availability
DELETE FROM daily_content_availability 
WHERE topic_id IN (
  'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
  '7c38403c-6fb0-4eab-831e-de3b0817025e',
  '973deca3-17f3-4e5a-899a-fd4f26b90260',
  '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
  '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
  'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
  'a375d196-16bf-4b46-846e-6cf8067de0f2',
  '0dc1da67-2975-4a42-af18-556ecb286398',
  'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
);

-- Step 8: Clean up discarded_articles
DELETE FROM discarded_articles 
WHERE topic_id IN (
  'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa',
  '7c38403c-6fb0-4eab-831e-de3b0817025e',
  '973deca3-17f3-4e5a-899a-fd4f26b90260',
  '535cc489-20cd-4b3a-89e8-c7f0549bae8d',
  '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06',
  'e288fe0e-cb6b-4fd9-929e-469a14f3930c',
  'a375d196-16bf-4b46-846e-6cf8067de0f2',
  '0dc1da67-2975-4a42-af18-556ecb286398',
  'e9064e24-9a87-4de8-8dca-8091ce26fb8a'
);