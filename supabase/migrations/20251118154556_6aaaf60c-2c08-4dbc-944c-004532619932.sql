-- Add illustration accent color column to topics table
ALTER TABLE topics ADD COLUMN IF NOT EXISTS illustration_accent_color TEXT DEFAULT '#58FFBC';

COMMENT ON COLUMN topics.illustration_accent_color IS 'Hex color code for illustration accent color (e.g., #58FFBC). Used in editorial_illustrative style to customize the single bold accent color.';