-- Add visual_id column to image_generation_tests to link test results to specific visuals
ALTER TABLE image_generation_tests 
ADD COLUMN visual_id uuid REFERENCES visuals(id);

-- Add index for better performance
CREATE INDEX idx_image_generation_tests_visual_id ON image_generation_tests(visual_id);