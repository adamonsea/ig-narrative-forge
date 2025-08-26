-- Create feed CTA configurations table
CREATE TABLE public.feed_cta_configs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  feed_name text NOT NULL UNIQUE,
  engagement_question text,
  show_like_share boolean NOT NULL DEFAULT true,
  attribution_cta text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.feed_cta_configs ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Feed CTA configs viewable by authenticated users" 
ON public.feed_cta_configs 
FOR SELECT 
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Feed CTA configs manageable by admins" 
ON public.feed_cta_configs 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Feed CTA configs service role access" 
ON public.feed_cta_configs 
FOR ALL 
USING (auth.role() = 'service_role');

-- Add trigger for updated_at
CREATE TRIGGER update_feed_cta_configs_updated_at
BEFORE UPDATE ON public.feed_cta_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default configurations
INSERT INTO public.feed_cta_configs (feed_name, engagement_question, show_like_share, attribution_cta, is_active) VALUES
('Eastbourne', 'What do you think about this?', true, 'Support local journalism', true),
('Brighton', 'What are your thoughts?', true, 'Support local journalism', true),
('Default', 'What do you think?', true, null, true);