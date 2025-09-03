-- Create enums for audience expertise and tone
CREATE TYPE audience_expertise AS ENUM ('beginner', 'intermediate', 'expert');
CREATE TYPE tone_type AS ENUM ('formal', 'conversational', 'engaging');

-- Add columns to topics table for expertise and default tone
ALTER TABLE topics 
ADD COLUMN audience_expertise audience_expertise DEFAULT 'intermediate',
ADD COLUMN default_tone tone_type DEFAULT 'conversational';

-- Add columns to content_generation_queue table for per-article tone and expertise
ALTER TABLE content_generation_queue 
ADD COLUMN tone tone_type DEFAULT 'conversational',
ADD COLUMN audience_expertise audience_expertise DEFAULT 'intermediate';

-- Create prompt templates table for granular prompt management
CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL UNIQUE,
  version INTEGER NOT NULL DEFAULT 1,
  category TEXT NOT NULL, -- 'base', 'tone', 'expertise', 'slideType'
  tone_type tone_type,
  audience_expertise audience_expertise,
  slide_type TEXT, -- 'short', 'tabloid', 'indepth', 'extensive'
  prompt_content TEXT NOT NULL,
  variables JSONB DEFAULT '{}', -- For parameter injection
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS on prompt_templates
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;

-- Create policies for prompt_templates (backend/admin access only)
CREATE POLICY "Prompt templates admin access" ON prompt_templates
FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Prompt templates service role access" ON prompt_templates
FOR ALL USING (auth.role() = 'service_role');

-- Create indexes for performance
CREATE INDEX idx_prompt_templates_category ON prompt_templates(category);
CREATE INDEX idx_prompt_templates_active ON prompt_templates(is_active);
CREATE INDEX idx_prompt_templates_tone_expertise ON prompt_templates(tone_type, audience_expertise);

-- Insert base prompt templates
INSERT INTO prompt_templates (template_name, category, prompt_content, variables) VALUES
('base_journalistic', 'base', 'You are an expert content creator specializing in transforming news articles into engaging social media carousels. Your goal is to create compelling, accurate, and well-structured content that maintains journalistic integrity while being engaging for social media audiences.', '{}'),

('tone_formal', 'tone', 'Use professional, authoritative language. Maintain objective reporting standards. Use clear, structured sentences. Avoid colloquialisms or casual expressions.', '{"tone": "formal"}'),

('tone_conversational', 'tone', 'Use accessible, friendly language that feels like explaining to a knowledgeable friend. Balance professionalism with approachability. Use "you" when appropriate.', '{"tone": "conversational"}'),

('tone_engaging', 'tone', 'Use dynamic, compelling language that draws readers in. Include contextually appropriate personality while maintaining credibility. Focus on human interest angles.', '{"tone": "engaging"}'),

('expertise_beginner', 'expertise', 'Explain concepts clearly with sufficient context. Define technical terms when first mentioned. Use analogies where helpful. Focus on broader implications rather than technical details.', '{"audience": "beginner"}'),

('expertise_intermediate', 'expertise', 'Balance technical accuracy with accessibility. Briefly explain specialized terms. Assume basic familiarity with the subject matter.', '{"audience": "intermediate"}'),

('expertise_expert', 'expertise', 'Use industry terminology and technical depth. Focus on nuanced implications and sophisticated analysis. Assume advanced subject matter knowledge.', '{"audience": "expert"}'),

('slide_type_short', 'slideType', 'Create concise, punchy content. Focus on key highlights and essential information. Optimize for quick consumption.', '{"slideType": "short", "targetSlides": 4}'),

('slide_type_tabloid', 'slideType', 'Create balanced content with good detail. Include context and key supporting information. Standard comprehensive coverage.', '{"slideType": "tabloid", "targetSlides": 6}'),

('slide_type_indepth', 'slideType', 'Create detailed, thorough content. Include background context, implications, and comprehensive analysis.', '{"slideType": "indepth", "targetSlides": 8}'),

('slide_type_extensive', 'slideType', 'Create comprehensive, detailed content with extensive analysis. Include multiple perspectives and thorough background information.', '{"slideType": "extensive", "targetSlides": 12});

-- Add trigger to update updated_at column
CREATE OR REPLACE FUNCTION update_prompt_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prompt_templates_updated_at
  BEFORE UPDATE ON prompt_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_prompt_templates_updated_at();