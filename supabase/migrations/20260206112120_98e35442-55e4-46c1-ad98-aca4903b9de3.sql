
-- Create 3 new demo topics for Culture, Environment, and Community
INSERT INTO public.topics (name, slug, topic_type, is_active, is_public, created_by, keywords, description)
VALUES 
  ('Culture and Arts', 'culture-and-arts', 'keyword', true, true, 'c8284651-7ca9-407d-99ac-85c19cbe212c', 
   ARRAY['culture', 'arts', 'entertainment', 'theatre', 'music', 'film', 'exhibitions'],
   'Culture, arts, entertainment and creative life'),
  ('Environment', 'environment-news', 'keyword', true, true, 'c8284651-7ca9-407d-99ac-85c19cbe212c',
   ARRAY['environment', 'climate', 'sustainability', 'nature', 'conservation', 'green energy'],
   'Environment, climate science and sustainability news'),
  ('Community', 'community-news', 'keyword', true, true, 'c8284651-7ca9-407d-99ac-85c19cbe212c',
   ARRAY['community', 'charity', 'voluntary', 'social', 'local voices', 'nonprofit'],
   'Community, charity and social affairs news');
