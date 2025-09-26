-- Create RPC function to record story interactions (similar to record_feed_visit)
CREATE OR REPLACE FUNCTION public.record_story_interaction(
    p_story_id UUID,
    p_topic_id UUID,
    p_visitor_id TEXT,
    p_interaction_type TEXT,
    p_slide_index INTEGER DEFAULT NULL,
    p_share_platform TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO story_interactions (
        story_id,
        topic_id,
        visitor_id,
        interaction_type,
        slide_index,
        share_platform,
        user_agent,
        referrer
    ) VALUES (
        p_story_id,
        p_topic_id,
        p_visitor_id,
        p_interaction_type,
        p_slide_index,
        p_share_platform,
        p_user_agent,
        p_referrer
    );
EXCEPTION
    WHEN OTHERS THEN
        -- Silent fail to prevent disrupting user experience
        NULL;
END;
$$;