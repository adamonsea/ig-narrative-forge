-- Create table for tracking image generation tests
CREATE TABLE IF NOT EXISTS public.image_generation_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  test_id uuid DEFAULT gen_random_uuid(),
  slide_id uuid,
  story_id uuid,
  api_provider text NOT NULL CHECK (api_provider IN ('openai', 'ideogram')),
  generation_time_ms integer,
  estimated_cost numeric(10,4),
  style_reference_used boolean DEFAULT false,
  success boolean NOT NULL DEFAULT true,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.image_generation_tests ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Image generation tests viewable by authenticated users" 
ON public.image_generation_tests 
FOR SELECT 
USING (true);

CREATE POLICY "Image generation tests manageable by authenticated users" 
ON public.image_generation_tests 
FOR ALL 
USING (true);

-- Add trigger for updated_at
CREATE TRIGGER update_image_generation_tests_updated_at
BEFORE UPDATE ON public.image_generation_tests
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();