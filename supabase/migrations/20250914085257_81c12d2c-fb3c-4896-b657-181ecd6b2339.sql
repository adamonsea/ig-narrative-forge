-- Create events table for AI-generated event listings
CREATE TABLE public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  start_date DATE NOT NULL,
  end_date DATE,
  location TEXT,
  source_url TEXT,
  source_name TEXT,
  event_type TEXT NOT NULL, -- music, comedy, shows, musicals, events, art_exhibitions
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'deleted')),
  rank_position INTEGER DEFAULT 0, -- For ordering in top 5
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Create topic event preferences table
CREATE TABLE public.topic_event_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  topic_id UUID NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(topic_id, event_type)
);

-- Enable RLS
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_event_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for events
CREATE POLICY "Events are viewable by topic access" 
ON public.events 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = events.topic_id 
    AND (topics.is_public = true OR topics.created_by = auth.uid())
  )
);

CREATE POLICY "Events can be created by topic owners" 
ON public.events 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = events.topic_id 
    AND topics.created_by = auth.uid()
  )
);

CREATE POLICY "Events can be updated by topic owners" 
ON public.events 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = events.topic_id 
    AND topics.created_by = auth.uid()
  )
);

CREATE POLICY "Events can be deleted by topic owners" 
ON public.events 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = events.topic_id 
    AND topics.created_by = auth.uid()
  )
);

-- RLS policies for topic event preferences
CREATE POLICY "Topic event preferences are viewable by topic owners" 
ON public.topic_event_preferences 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = topic_event_preferences.topic_id 
    AND topics.created_by = auth.uid()
  )
);

CREATE POLICY "Topic event preferences can be managed by topic owners" 
ON public.topic_event_preferences 
FOR ALL 
USING (
  EXISTS (
    SELECT 1 FROM topics 
    WHERE topics.id = topic_event_preferences.topic_id 
    AND topics.created_by = auth.uid()
  )
);

-- Add indexes for performance
CREATE INDEX idx_events_topic_status ON public.events(topic_id, status);
CREATE INDEX idx_events_start_date ON public.events(start_date);
CREATE INDEX idx_events_event_type ON public.events(event_type);
CREATE INDEX idx_events_rank_position ON public.events(rank_position);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_events_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_events_updated_at
BEFORE UPDATE ON public.events
FOR EACH ROW
EXECUTE FUNCTION public.update_events_updated_at_column();

CREATE TRIGGER update_topic_event_preferences_updated_at
BEFORE UPDATE ON public.topic_event_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_events_updated_at_column();

-- RPC function to get top 5 events for a topic
CREATE OR REPLACE FUNCTION get_topic_events(topic_id_param UUID)
RETURNS TABLE (
  id UUID,
  title TEXT,
  description TEXT,
  start_date DATE,
  end_date DATE,
  location TEXT,
  source_url TEXT,
  source_name TEXT,
  event_type TEXT,
  rank_position INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    e.id,
    e.title,
    e.description,
    e.start_date,
    e.end_date,
    e.location,
    e.source_url,
    e.source_name,
    e.event_type,
    e.rank_position
  FROM events e
  WHERE e.topic_id = topic_id_param 
    AND e.status = 'published'
    AND e.start_date >= CURRENT_DATE
  ORDER BY e.rank_position ASC, e.start_date ASC
  LIMIT 5;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC function to delete event and backfill from reserve
CREATE OR REPLACE FUNCTION delete_event_with_backfill(event_id_param UUID)
RETURNS TABLE (
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  topic_id_var UUID;
  deleted_rank INTEGER;
  replacement_event_id UUID;
BEGIN
  -- Get topic_id and rank of event to delete
  SELECT topic_id, rank_position INTO topic_id_var, deleted_rank
  FROM events WHERE id = event_id_param;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'Event not found'::TEXT;
    RETURN;
  END IF;
  
  -- Delete the event
  UPDATE events SET status = 'deleted' WHERE id = event_id_param;
  
  -- Find replacement from reserve (events ranked 6+)
  SELECT id INTO replacement_event_id
  FROM events 
  WHERE topic_id = topic_id_var 
    AND status = 'published'
    AND start_date >= CURRENT_DATE
    AND rank_position > 5
  ORDER BY rank_position ASC, start_date ASC 
  LIMIT 1;
  
  -- If replacement found, promote it to top 5
  IF replacement_event_id IS NOT NULL THEN
    UPDATE events 
    SET rank_position = deleted_rank 
    WHERE id = replacement_event_id;
    
    RETURN QUERY SELECT true, 'Event deleted and replacement promoted'::TEXT;
  ELSE
    RETURN QUERY SELECT true, 'Event deleted (no replacement available)'::TEXT;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;