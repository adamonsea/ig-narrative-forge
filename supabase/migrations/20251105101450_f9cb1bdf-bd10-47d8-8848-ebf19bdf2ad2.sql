-- Create illustration_style enum type
CREATE TYPE illustration_style_enum AS ENUM (
  'editorial_illustrative',
  'editorial_photographic'
);

-- Add illustration_style column to topics table
ALTER TABLE topics 
ADD COLUMN illustration_style illustration_style_enum 
DEFAULT 'editorial_illustrative' NOT NULL;

-- Add validation constraint
ALTER TABLE topics
ADD CONSTRAINT illustration_style_valid CHECK (
  illustration_style IN ('editorial_illustrative', 'editorial_photographic')
);

-- Create index for efficient filtering by style
CREATE INDEX idx_topics_illustration_style ON topics(illustration_style);

-- Add feature flag for photographic mode (killswitch)
INSERT INTO feature_flags (flag_name, enabled, description)
VALUES (
  'illustration_photographic_mode',
  true,
  'Enables photographic editorial style option. Disable to hide photographic mode if FLUX API has issues.'
)
ON CONFLICT (flag_name) DO NOTHING;

-- Log migration
INSERT INTO system_logs (level, message, context, function_name)
VALUES (
  'info',
  'Added illustration_style column to topics with photographic mode feature flag',
  jsonb_build_object(
    'migration', 'add_illustration_style_enum',
    'default_value', 'editorial_illustrative',
    'feature_flag', 'illustration_photographic_mode'
  ),
  'migration'
);

-- ROLLBACK INSTRUCTIONS (for emergencies):
-- To rollback this migration, run:
-- DROP INDEX IF EXISTS idx_topics_illustration_style;
-- ALTER TABLE topics DROP CONSTRAINT IF EXISTS illustration_style_valid;
-- ALTER TABLE topics DROP COLUMN IF EXISTS illustration_style;
-- DROP TYPE IF EXISTS illustration_style_enum;
-- DELETE FROM feature_flags WHERE flag_name = 'illustration_photographic_mode';