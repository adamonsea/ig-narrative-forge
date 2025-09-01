-- Update RLS policies to allow topic creators access to their topic content regardless of region

-- Update articles policy
DROP POLICY IF EXISTS "Articles viewable by authenticated users with region access" ON articles;
CREATE POLICY "Articles viewable by authenticated users with region access" 
ON articles FOR SELECT
USING (
  (auth.uid() IS NOT NULL) AND (
    -- Region access
    (EXISTS (
      SELECT 1 FROM user_regions 
      WHERE user_regions.user_id = auth.uid() AND user_regions.region = articles.region
    )) OR 
    -- Admin access
    has_role(auth.uid(), 'admin'::app_role) OR 
    -- No region set
    (region IS NULL) OR
    -- Topic creator access
    (topic_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM topics 
      WHERE topics.id = articles.topic_id AND topics.created_by = auth.uid()
    ))
  )
);

-- Update stories policy
DROP POLICY IF EXISTS "Stories manageable by region access" ON stories;
CREATE POLICY "Stories manageable by region access" 
ON stories FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = stories.article_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = stories.article_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = stories.article_id AND t.created_by = auth.uid()
      ))
    )
  )
);

-- Update slides policy
DROP POLICY IF EXISTS "Slides manageable by region access" ON slides;
CREATE POLICY "Slides manageable by region access" 
ON slides FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN user_regions ur ON ur.region = a.region
        WHERE s.id = slides.story_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        WHERE s.id = slides.story_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN topics t ON t.id = a.topic_id
        WHERE s.id = slides.story_id AND t.created_by = auth.uid()
      ))
    )
  )
);

-- Update visuals policy
DROP POLICY IF EXISTS "Visuals manageable by region access" ON visuals;
CREATE POLICY "Visuals manageable by region access" 
ON visuals FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM slides sl
        JOIN stories s ON s.id = sl.story_id
        JOIN articles a ON a.id = s.article_id
        JOIN user_regions ur ON ur.region = a.region
        WHERE sl.id = visuals.slide_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM slides sl
        JOIN stories s ON s.id = sl.story_id
        JOIN articles a ON a.id = s.article_id
        WHERE sl.id = visuals.slide_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM slides sl
        JOIN stories s ON s.id = sl.story_id
        JOIN articles a ON a.id = s.article_id
        JOIN topics t ON t.id = a.topic_id
        WHERE sl.id = visuals.slide_id AND t.created_by = auth.uid()
      ))
    )
  )
);

-- Update content_generation_queue policy
DROP POLICY IF EXISTS "Content generation queue manageable by region access" ON content_generation_queue;
CREATE POLICY "Content generation queue manageable by region access" 
ON content_generation_queue FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = content_generation_queue.article_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = content_generation_queue.article_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = content_generation_queue.article_id AND t.created_by = auth.uid()
      ))
    )
  )
);

-- Update content_generation_queue viewable policy
DROP POLICY IF EXISTS "Content generation queue viewable by region access" ON content_generation_queue;
CREATE POLICY "Content generation queue viewable by region access" 
ON content_generation_queue FOR SELECT
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM articles a
        JOIN user_regions ur ON ur.region = a.region
        WHERE a.id = content_generation_queue.article_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM articles a
        WHERE a.id = content_generation_queue.article_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM articles a
        JOIN topics t ON t.id = a.topic_id
        WHERE a.id = content_generation_queue.article_id AND t.created_by = auth.uid()
      ))
    )
  )
);

-- Update posts policy
DROP POLICY IF EXISTS "Posts manageable by region access" ON posts;
CREATE POLICY "Posts manageable by region access" 
ON posts FOR ALL
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN user_regions ur ON ur.region = a.region
        WHERE s.id = posts.story_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        WHERE s.id = posts.story_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN topics t ON t.id = a.topic_id
        WHERE s.id = posts.story_id AND t.created_by = auth.uid()
      ))
    )
  )
);

-- Update posts viewable policy
DROP POLICY IF EXISTS "Posts viewable by region access" ON posts;
CREATE POLICY "Posts viewable by region access" 
ON posts FOR SELECT
USING (
  (auth.role() = 'service_role'::text) OR (
    (auth.uid() IS NOT NULL) AND (
      -- Region access
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN user_regions ur ON ur.region = a.region
        WHERE s.id = posts.story_id AND ur.user_id = auth.uid()
      )) OR 
      -- Admin access
      has_role(auth.uid(), 'admin'::app_role) OR 
      -- No region set
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        WHERE s.id = posts.story_id AND a.region IS NULL
      )) OR
      -- Topic creator access
      (EXISTS (
        SELECT 1 FROM stories s
        JOIN articles a ON a.id = s.article_id
        JOIN topics t ON t.id = a.topic_id
        WHERE s.id = posts.story_id AND t.created_by = auth.uid()
      ))
    )
  )
);