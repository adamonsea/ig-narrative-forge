-- ==============================
-- AUDIO BRIEFINGS INFRASTRUCTURE
-- ==============================

-- Add premium audio briefing toggles to topics table
ALTER TABLE public.topics 
ADD COLUMN IF NOT EXISTS audio_briefings_daily_enabled boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS audio_briefings_weekly_enabled boolean DEFAULT false;

-- Add audio storage fields to topic_roundups table
ALTER TABLE public.topic_roundups
ADD COLUMN IF NOT EXISTS audio_url text,
ADD COLUMN IF NOT EXISTS audio_generated_at timestamptz,
ADD COLUMN IF NOT EXISTS audio_script text;

-- Create storage bucket for audio briefings
INSERT INTO storage.buckets (id, name, public)
VALUES ('audio-briefings', 'audio-briefings', true)
ON CONFLICT (id) DO NOTHING;

-- Create RLS policies for audio-briefings bucket
CREATE POLICY "Audio briefings are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'audio-briefings');

CREATE POLICY "Authenticated users can upload audio briefings"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'audio-briefings' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update audio briefings"
ON storage.objects FOR UPDATE
USING (bucket_id = 'audio-briefings' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete audio briefings"
ON storage.objects FOR DELETE
USING (bucket_id = 'audio-briefings' AND auth.role() = 'authenticated');

-- Add comments for documentation
COMMENT ON COLUMN public.topics.audio_briefings_daily_enabled IS 'Premium toggle for daily audio briefings generation';
COMMENT ON COLUMN public.topics.audio_briefings_weekly_enabled IS 'Premium toggle for weekly audio briefings generation';
COMMENT ON COLUMN public.topic_roundups.audio_url IS 'URL to the generated MP3 file in Supabase Storage';
COMMENT ON COLUMN public.topic_roundups.audio_generated_at IS 'Timestamp when audio was last generated';
COMMENT ON COLUMN public.topic_roundups.audio_script IS 'The script used for TTS generation (for debugging/regeneration)';