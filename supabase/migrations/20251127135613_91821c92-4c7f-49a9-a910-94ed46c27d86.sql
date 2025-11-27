-- Add quiz_cards_enabled to topic_insight_settings
ALTER TABLE topic_insight_settings 
ADD COLUMN IF NOT EXISTS quiz_cards_enabled BOOLEAN DEFAULT false;

-- Create quiz_questions table
CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id UUID NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  source_story_id UUID REFERENCES public.stories(id) ON DELETE SET NULL,
  question_text TEXT NOT NULL,
  options JSONB NOT NULL, -- [{label: "A", text: "...", is_correct: boolean}]
  correct_option TEXT NOT NULL,
  explanation TEXT,
  difficulty TEXT DEFAULT 'medium' CHECK (difficulty IN ('easy', 'medium', 'hard')),
  category TEXT DEFAULT 'factual' CHECK (category IN ('factual', 'numerical', 'temporal', 'contextual')),
  total_responses INTEGER DEFAULT 0,
  correct_responses INTEGER DEFAULT 0,
  option_distribution JSONB DEFAULT '{}', -- {A: 45, B: 23, C: 32, D: 0}
  valid_until TIMESTAMPTZ NOT NULL,
  is_published BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create quiz_responses table for deduplication and analytics
CREATE TABLE IF NOT EXISTS public.quiz_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  visitor_id TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  selected_option TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT unique_question_visitor UNIQUE (question_id, visitor_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quiz_questions_topic_id ON public.quiz_questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_valid_until ON public.quiz_questions(valid_until);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_source_story ON public.quiz_questions(source_story_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_question_id ON public.quiz_responses(question_id);
CREATE INDEX IF NOT EXISTS idx_quiz_responses_visitor_id ON public.quiz_responses(visitor_id);

-- Enable RLS
ALTER TABLE public.quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quiz_responses ENABLE ROW LEVEL SECURITY;

-- RLS Policies for quiz_questions
CREATE POLICY "Anyone can view published quiz questions"
ON public.quiz_questions FOR SELECT
USING (is_published = true AND valid_until > now());

CREATE POLICY "Service role can manage quiz questions"
ON public.quiz_questions FOR ALL
USING (true)
WITH CHECK (true);

-- RLS Policies for quiz_responses
CREATE POLICY "Anyone can insert quiz responses"
ON public.quiz_responses FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can view their own responses"
ON public.quiz_responses FOR SELECT
USING (visitor_id IS NOT NULL OR user_id = auth.uid());

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION public.update_quiz_questions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_quiz_questions_updated_at
BEFORE UPDATE ON public.quiz_questions
FOR EACH ROW
EXECUTE FUNCTION public.update_quiz_questions_updated_at();

-- Enable quiz cards for test feeds
UPDATE topic_insight_settings
SET quiz_cards_enabled = true
WHERE topic_id IN (
  SELECT id FROM topics WHERE slug IN ('eastbourne', 'kenilworth', 'medical-device-development')
);

-- Create RPC function to get quiz stats for dashboard
CREATE OR REPLACE FUNCTION public.get_topic_quiz_stats(p_topic_id UUID, p_days INTEGER DEFAULT 7)
RETURNS TABLE(
  quiz_responses_count BIGINT,
  correct_rate NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(qr.id)::BIGINT as quiz_responses_count,
    CASE 
      WHEN COUNT(qr.id) > 0 
      THEN ROUND((COUNT(*) FILTER (WHERE qr.is_correct = true)::NUMERIC / COUNT(qr.id)::NUMERIC) * 100, 1)
      ELSE 0
    END as correct_rate
  FROM quiz_responses qr
  JOIN quiz_questions qq ON qq.id = qr.question_id
  WHERE qq.topic_id = p_topic_id
    AND qr.created_at >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$;