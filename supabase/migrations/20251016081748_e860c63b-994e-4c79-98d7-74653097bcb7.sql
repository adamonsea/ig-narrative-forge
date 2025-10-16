-- Create enum for tracking confidence levels
CREATE TYPE mp_detection_confidence AS ENUM ('high', 'medium', 'low');

-- Create topic_tracked_mps table
CREATE TABLE IF NOT EXISTS public.topic_tracked_mps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id uuid REFERENCES public.topics(id) ON DELETE CASCADE NOT NULL,
  mp_id integer NOT NULL,
  mp_name text NOT NULL,
  mp_party text NOT NULL,
  constituency text NOT NULL,
  is_primary boolean DEFAULT false,
  is_auto_detected boolean DEFAULT true,
  tracking_enabled boolean DEFAULT true,
  detection_confidence mp_detection_confidence DEFAULT 'high',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(topic_id, mp_id)
);

-- Enable RLS
ALTER TABLE public.topic_tracked_mps ENABLE ROW LEVEL SECURITY;

-- Topic owners can manage their tracked MPs
CREATE POLICY "Topic owners can manage tracked MPs"
ON public.topic_tracked_mps
FOR ALL
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  ) 
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
)
WITH CHECK (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE created_by = auth.uid()
  )
  OR has_role(auth.uid(), 'admin'::app_role)
  OR auth.role() = 'service_role'
);

-- Public can view tracked MPs for public topics
CREATE POLICY "Public can view tracked MPs for public topics"
ON public.topic_tracked_mps
FOR SELECT
USING (
  topic_id IN (
    SELECT id FROM public.topics 
    WHERE is_public = true AND is_active = true
  )
);

-- Create updated_at trigger
CREATE TRIGGER update_topic_tracked_mps_updated_at
BEFORE UPDATE ON public.topic_tracked_mps
FOR EACH ROW
EXECUTE FUNCTION public.update_events_updated_at_column();

-- Fix Eastbourne by adding correct MP
INSERT INTO public.topic_tracked_mps (topic_id, mp_id, mp_name, mp_party, constituency, is_primary, is_auto_detected, detection_confidence)
VALUES (
  'd224e606-1a4c-4713-8135-1d30e2d6d0c6'::uuid,
  5086,
  'Josh Babarinde',
  'Liberal Democrat',
  'Eastbourne',
  true,
  true,
  'high'
)
ON CONFLICT (topic_id, mp_id) DO UPDATE 
SET 
  mp_name = EXCLUDED.mp_name,
  mp_party = EXCLUDED.mp_party,
  is_primary = EXCLUDED.is_primary,
  tracking_enabled = true,
  updated_at = now();