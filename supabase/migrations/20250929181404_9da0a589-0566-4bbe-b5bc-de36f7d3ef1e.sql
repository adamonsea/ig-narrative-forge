-- Add story_id column to parliamentary_mentions table
ALTER TABLE parliamentary_mentions 
ADD COLUMN story_id UUID REFERENCES stories(id) ON DELETE SET NULL;

-- Create index for efficient story lookups
CREATE INDEX IF NOT EXISTS idx_parliamentary_mentions_story_id ON parliamentary_mentions(story_id);

-- Add public viewing policy for parliamentary mentions linked to published stories
CREATE POLICY "Public parliamentary mentions from published stories"
ON parliamentary_mentions FOR SELECT
USING (
  story_id IS NOT NULL AND
  EXISTS (
    SELECT 1 FROM stories s
    WHERE s.id = parliamentary_mentions.story_id
      AND s.is_published = true
      AND s.status IN ('ready', 'published')
  )
);