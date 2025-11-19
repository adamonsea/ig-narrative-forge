-- Convert any existing HSL values to hex format
-- This migration ensures all illustration_primary_color values are in hex format
UPDATE topics 
SET illustration_primary_color = 
  CASE 
    WHEN illustration_primary_color LIKE '#%' THEN illustration_primary_color
    WHEN illustration_primary_color IS NULL THEN NULL
    ELSE '#10B981' -- fallback mint green for any non-hex values (e.g. HSL format)
  END
WHERE illustration_primary_color IS NOT NULL;