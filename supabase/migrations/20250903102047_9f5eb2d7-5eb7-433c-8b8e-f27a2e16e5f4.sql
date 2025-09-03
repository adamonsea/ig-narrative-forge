-- Add writing style columns to support MVP style picker
ALTER TABLE topics 
ADD COLUMN default_writing_style text DEFAULT 'journalistic';

ALTER TABLE content_generation_queue 
ADD COLUMN writing_style text DEFAULT 'journalistic';

-- Create prompt templates for the four writing styles
INSERT INTO prompt_templates (template_name, category, prompt_content, is_active) VALUES
('journalistic', 'writing_style', 'Structure your content using traditional journalism principles:
- Lead with the most important information (who, what, when, where, why)
- Use inverted pyramid structure with key facts first
- Include proper attribution and quotes where relevant
- Write in active voice with clear, concise language
- Use short paragraphs for readability
- End with supporting details and context', true),

('educational', 'writing_style', 'Create educational content that teaches and informs:
- Start with clear learning objectives or key takeaways
- Use simple, accessible language with definitions for technical terms
- Include concrete examples to illustrate concepts
- Structure information logically from basic to complex
- Add practical applications or next steps
- Use bullet points or numbered lists for clarity
- End with a summary of main points', true),

('listicle', 'writing_style', 'Format content as an organized list structure:
- Use numbered or bulleted points for main ideas
- Keep each point concise but complete
- Start with an engaging introduction explaining the list
- Make each point actionable or specific
- Use parallel structure across all points
- Include brief explanations or examples for each point
- Consider using subheadings for longer lists', true),

('story_driven', 'writing_style', 'Tell the story using narrative techniques:
- Begin with a compelling hook or scene
- Introduce characters and establish setting
- Build narrative tension or conflict
- Use descriptive language and dialogue where appropriate
- Follow a clear story arc with resolution
- Connect the story to broader themes or lessons
- End with impact or reflection on the story meaning', true);