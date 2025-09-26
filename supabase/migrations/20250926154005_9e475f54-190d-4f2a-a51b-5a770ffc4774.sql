-- Create table to track story interactions (swipes and shares)
CREATE TABLE IF NOT EXISTS public.story_interactions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    story_id UUID NOT NULL,
    topic_id UUID NOT NULL,
    visitor_id TEXT NOT NULL, -- Anonymous visitor tracking ID
    interaction_type TEXT NOT NULL CHECK (interaction_type IN ('swipe', 'share_click')),
    slide_index INTEGER, -- Which slide was swiped (null for share_click)
    share_platform TEXT, -- For share clicks: 'twitter', 'facebook', 'linkedin', 'copy_link', etc.
    user_agent TEXT,
    referrer TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_story_interactions_story_id ON public.story_interactions(story_id);
CREATE INDEX IF NOT EXISTS idx_story_interactions_topic_id ON public.story_interactions(topic_id);
CREATE INDEX IF NOT EXISTS idx_story_interactions_type ON public.story_interactions(interaction_type);
CREATE INDEX IF NOT EXISTS idx_story_interactions_created_at ON public.story_interactions(created_at);

-- Enable RLS
ALTER TABLE public.story_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Story interactions can be inserted by anyone" 
    ON public.story_interactions 
    FOR INSERT 
    WITH CHECK (true);

CREATE POLICY "Topic owners can view their story interactions" 
    ON public.story_interactions 
    FOR SELECT 
    USING (
        topic_id IN (
            SELECT id FROM topics 
            WHERE created_by = auth.uid()
        ) 
        OR has_role(auth.uid(), 'admin'::app_role)
    );

CREATE POLICY "Service role can manage all story interactions" 
    ON public.story_interactions 
    FOR ALL 
    USING (auth.role() = 'service_role');

-- Function to get story interaction stats for a topic
CREATE OR REPLACE FUNCTION public.get_topic_interaction_stats(p_topic_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE(
    articles_swiped BIGINT,
    total_swipes BIGINT,
    share_clicks BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(DISTINCT story_id) AS articles_swiped,
        COUNT(*) FILTER (WHERE interaction_type = 'swipe') AS total_swipes,
        COUNT(*) FILTER (WHERE interaction_type = 'share_click') AS share_clicks
    FROM story_interactions
    WHERE topic_id = p_topic_id
        AND created_at >= now() - (p_days || ' days')::interval;
END;
$$;