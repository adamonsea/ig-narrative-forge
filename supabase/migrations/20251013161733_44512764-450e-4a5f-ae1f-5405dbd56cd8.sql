-- Change default for is_published to false so new sentiment cards require review
ALTER TABLE sentiment_cards 
ALTER COLUMN is_published SET DEFAULT false;