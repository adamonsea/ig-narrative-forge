-- Create enums for audience expertise and tone
DO $$ BEGIN
    CREATE TYPE audience_expertise AS ENUM ('beginner', 'intermediate', 'expert');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE tone_type AS ENUM ('formal', 'conversational', 'engaging');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add columns to topics table for expertise and default tone
ALTER TABLE topics 
ADD COLUMN IF NOT EXISTS audience_expertise audience_expertise DEFAULT 'intermediate',
ADD COLUMN IF NOT EXISTS default_tone tone_type DEFAULT 'conversational';

-- Add columns to content_generation_queue table for per-article tone and expertise
ALTER TABLE content_generation_queue 
ADD COLUMN IF NOT EXISTS tone tone_type DEFAULT 'conversational',
ADD COLUMN IF NOT EXISTS audience_expertise audience_expertise DEFAULT 'intermediate';

-- Create prompt templates table for granular prompt management
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL,
  tone_type tone_type,
  audience_expertise audience_expertise,
  slide_type TEXT,
  prompt_content TEXT NOT NULL,
  variables JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on prompt_templates
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Create policies for prompt_templates (backend/admin access only)
DROP POLICY IF EXISTS "Prompt templates admin access" ON prompt_templates;
CREATE POLICY "Prompt templates admin access" ON prompt_templates
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Prompt templates service role access" ON prompt_templates;
CREATE POLICY "Prompt templates service role access" ON prompt_templates
FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_tone_expertise ON prompt_templates(tone_type, audience_expertise);