-- Fix API provider constraint to include all current providers
ALTER TABLE image_generation_tests 
DROP CONSTRAINT IF EXISTS image_generation_tests_api_provider_check;

ALTER TABLE image_generation_tests 
ADD CONSTRAINT image_generation_tests_api_provider_check 
CHECK (api_provider = ANY (ARRAY['openai'::text, 'ideogram'::text, 'fal'::text, 'replicate'::text, 'huggingface'::text, 'deepinfra'::text, 'nebius'::text, 'midjourney'::text]));