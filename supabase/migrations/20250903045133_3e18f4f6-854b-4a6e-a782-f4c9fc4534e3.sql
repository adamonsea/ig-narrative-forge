-- Create enums for audience expertise and tone
CREATE TYPE audience_expertise AS ENUM ('beginner', 'intermediate', 'expert');
CREATE TYPE tone_type AS ENUM ('formal', 'conversational', 'engaging');