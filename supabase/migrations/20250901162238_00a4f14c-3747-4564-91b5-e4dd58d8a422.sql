-- Manually delete the stuck story 'Stunning new artworks unveiled at Plumpton railway station'
-- Delete in correct order to handle foreign key constraints

-- Delete visuals first (connected through slides)
DELETE FROM visuals WHERE slide_id IN (SELECT id FROM slides WHERE story_id = 'ca04bdfd-7d55-4d6e-8f16-827b49c52b70');

-- Delete slides
DELETE FROM slides WHERE story_id = 'ca04bdfd-7d55-4d6e-8f16-827b49c52b70';

-- Delete posts
DELETE FROM posts WHERE story_id = 'ca04bdfd-7d55-4d6e-8f16-827b49c52b70';

-- Delete carousel exports
DELETE FROM carousel_exports WHERE story_id = 'ca04bdfd-7d55-4d6e-8f16-827b49c52b70';

-- Reset the article status to 'new' 
UPDATE articles 
SET processing_status = 'new', updated_at = now()
WHERE id = (SELECT article_id FROM stories WHERE id = 'ca04bdfd-7d55-4d6e-8f16-827b49c52b70');

-- Delete the story itself
DELETE FROM stories WHERE id = 'ca04bdfd-7d55-4d6e-8f16-827b49c52b70';