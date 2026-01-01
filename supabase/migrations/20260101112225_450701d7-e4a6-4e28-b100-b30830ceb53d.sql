-- Performance indexes for swipe mode and quiz queries

-- Index for finding published stories by topic_article_id
CREATE INDEX IF NOT EXISTS idx_stories_topic_article_published 
  ON stories(topic_article_id, status) 
  WHERE status = 'published';

-- Index for filtering user swipes by topic
CREATE INDEX IF NOT EXISTS idx_story_swipes_user_topic 
  ON story_swipes(user_id, topic_id);

-- Index for ordering slides within a story
CREATE INDEX IF NOT EXISTS idx_slides_story_number 
  ON slides(story_id, slide_number);

-- Index for quiz questions by topic
CREATE INDEX IF NOT EXISTS idx_quiz_questions_topic_published
  ON quiz_questions(topic_id, is_published)
  WHERE is_published = true;

-- Index for quiz responses by visitor
CREATE INDEX IF NOT EXISTS idx_quiz_responses_visitor
  ON quiz_responses(visitor_id, question_id);