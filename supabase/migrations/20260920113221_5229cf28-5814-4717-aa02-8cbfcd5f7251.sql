
-- ab_test_events
DROP POLICY IF EXISTS "Anyone can insert ab test events" ON public.ab_test_events;
CREATE POLICY "Anyone can insert ab test events"
ON public.ab_test_events FOR INSERT
WITH CHECK (
  length(visitor_id) BETWEEN 1 AND 128
  AND length(test_name) BETWEEN 1 AND 100
  AND length(variant) BETWEEN 1 AND 50
  AND length(event_type) BETWEEN 1 AND 50
  AND (topic_id IS NULL OR EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id))
);

-- feed_clicks
DROP POLICY IF EXISTS "Allow anonymous click tracking inserts" ON public.feed_clicks;
CREATE POLICY "Allow anonymous click tracking inserts"
ON public.feed_clicks FOR INSERT
WITH CHECK (
  length(visitor_id) BETWEEN 1 AND 128
  AND click_date = CURRENT_DATE
  AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id)
);

-- feed_visits
DROP POLICY IF EXISTS "Anyone can record visits" ON public.feed_visits;
CREATE POLICY "Anyone can record visits"
ON public.feed_visits FOR INSERT
WITH CHECK (
  length(visitor_id) BETWEEN 1 AND 128
  AND visit_date = CURRENT_DATE
  AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id)
);

DROP POLICY IF EXISTS "Anyone can update their visit counter" ON public.feed_visits;
CREATE POLICY "Anyone can update their visit counter"
ON public.feed_visits FOR UPDATE
TO anon, authenticated
USING (visit_date = CURRENT_DATE)
WITH CHECK (
  visit_date = CURRENT_DATE
  AND length(visitor_id) BETWEEN 1 AND 128
  AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id)
);

-- site_visits
DROP POLICY IF EXISTS "Anyone can insert site visits" ON public.site_visits;
CREATE POLICY "Anyone can insert site visits"
ON public.site_visits FOR INSERT
WITH CHECK (
  length(visitor_id) BETWEEN 1 AND 128
  AND length(page_path) BETWEEN 1 AND 500
  AND visit_date = CURRENT_DATE
  AND (topic_id IS NULL OR EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id))
);

-- story_impressions
DROP POLICY IF EXISTS "Anyone can record story impressions" ON public.story_impressions;
CREATE POLICY "Anyone can record story impressions"
ON public.story_impressions FOR INSERT
WITH CHECK (
  length(visitor_id) BETWEEN 1 AND 128
  AND impression_date = CURRENT_DATE
  AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id)
  AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id)
);

-- story_interactions
DROP POLICY IF EXISTS "Story interactions can be inserted by anyone" ON public.story_interactions;
CREATE POLICY "Story interactions can be inserted by anyone"
ON public.story_interactions FOR INSERT
WITH CHECK (
  length(visitor_id) BETWEEN 1 AND 128
  AND length(interaction_type) BETWEEN 1 AND 50
  AND EXISTS (SELECT 1 FROM public.topics t WHERE t.id = topic_id)
  AND EXISTS (SELECT 1 FROM public.stories s WHERE s.id = story_id)
);

-- quiz_responses: writes only via secure server function (service role)
DROP POLICY IF EXISTS "Anyone can insert quiz responses" ON public.quiz_responses;

-- widget_analytics: writes only via secure server function (service role)
DROP POLICY IF EXISTS "Anyone can insert widget analytics" ON public.widget_analytics;

-- short_links: managed only by secure server functions
DROP POLICY IF EXISTS "Allow insert for short link creation" ON public.short_links;
DROP POLICY IF EXISTS "Anyone can read short links" ON public.short_links;

-- waitlist: require a valid email shape
DROP POLICY IF EXISTS "Anyone can join waitlist" ON public.waitlist;
CREATE POLICY "Anyone can join waitlist"
ON public.waitlist FOR INSERT
WITH CHECK (
  email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
  AND length(email) <= 254
);

-- keyword_analytics: only feed owners and admins
DROP POLICY IF EXISTS "Keyword analytics readable by authenticated users" ON public.keyword_analytics;
CREATE POLICY "Keyword analytics readable by feed owners and admins"
ON public.keyword_analytics FOR SELECT
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role)
  OR EXISTS (SELECT 1 FROM public.topics t WHERE t.created_by = (SELECT auth.uid()))
);

-- story_categories: public read limited to active categories on public feeds
DROP POLICY IF EXISTS "Categories are readable by everyone" ON public.story_categories;
CREATE POLICY "Active categories on public feeds are readable"
ON public.story_categories FOR SELECT
USING (
  is_active
  AND (
    topic_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.topics t
      WHERE t.id = story_categories.topic_id
        AND t.is_public AND t.is_active AND NOT t.is_archived
    )
  )
);

-- story_category_assignments: public read limited to published stories
DROP POLICY IF EXISTS "Assignments are readable by everyone" ON public.story_category_assignments;
CREATE POLICY "Assignments for published stories are readable"
ON public.story_category_assignments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.stories s
    WHERE s.id = story_category_assignments.story_id
      AND s.is_published
  )
);
