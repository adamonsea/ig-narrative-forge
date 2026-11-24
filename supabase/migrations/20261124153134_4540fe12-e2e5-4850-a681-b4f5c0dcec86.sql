ALTER TABLE public.feed_editorial_profiles
  ADD COLUMN IF NOT EXISTS labels jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS flag_rules jsonb NOT NULL DEFAULT '{}'::jsonb;

INSERT INTO public.feed_editorial_profiles (topic_id, enabled, languages, caption_templates, fixed_hashtags, event_hashtag_min, event_hashtag_max, genres, flags, flag_rules, labels, voice_rules)
SELECT id, true, '{pt-PT,en}',
  jsonb_build_object(
    'instagram', jsonb_build_array('{heading}','{subheading}','','{day} {date}[ · {time}]','{venue}','[{price} · ]{tickets}','{extra_facts}','','{synopsis.pt-PT}','','{synopsis.en}','','{hashtags}'),
    'website', jsonb_build_array('{heading}','{subheading}','','{day} {date}[ · {time}]','{venue}','{price}','{ticket_note}','{extra_facts}','','{synopsis.pt-PT}','','{synopsis.en}')
  ),
  '{#lisboa,#oquefazeremlisboa,#whatsonlisbon}', 2, 4,
  '[{"name":"Música","from":["música","musica","concerto","concertos","fado","jazz","clássica"]},
    {"name":"Clubes","from":["clubes","clube","dj","club"]},
    {"name":"Comédia","from":["comédia","comedia","stand-up","standup","improv"]},
    {"name":"Teatro","from":["teatro","performance"]},
    {"name":"Dança","from":["dança","danca","ballet","bailado"]},
    {"name":"Cinema","from":["cinema","filme","film"]},
    {"name":"Arte","from":["artes","arte","exposição","exposições","exposicao"]},
    {"name":"Conversas","from":["literatura","ciências","ciencias","conversa","conversas","conferência"]},
    {"name":"Feiras & mercados","from":["feiras","feira","mercado","mercados"]},
    {"name":"Visitas & ar livre","from":["visitas guiadas","visita guiada","visitas","passeio","ar livre"]},
    {"name":"Desporto","from":["desporto","futebol"]}]'::jsonb,
  '{"Crianças / Kids","Grátis / Free","Em inglês / English-friendly","Festival"}',
  '{"Crianças / Kids":"kids","Grátis / Free":"free","Em inglês / English-friendly":"english","Festival":"festival"}'::jsonb,
  '{"free":"Grátis / Free","tickets":"Bilhetes / Tickets: link na bio / link in bio"}'::jsonb,
  '{"A knowledgeable local friend: plain, specific, warm.","No promotional words (unmissable, unforgettable, great energy, imperdível, inesquecível).","No exclamation marks, no rhetorical questions, never \"Don''t miss\" / \"Não perca\".","Portuguese is European, never Brazilian (bilhete, realizadora, miúdos e graúdos).","Never copy the source''s sentences."}'
FROM public.topics WHERE id = 'aa51af2f-2d3b-48d0-a3e3-d077c5d94fac'
ON CONFLICT (topic_id) DO UPDATE SET enabled = true, languages = EXCLUDED.languages, caption_templates = EXCLUDED.caption_templates,
  fixed_hashtags = EXCLUDED.fixed_hashtags, genres = EXCLUDED.genres, flags = EXCLUDED.flags, flag_rules = EXCLUDED.flag_rules,
  labels = EXCLUDED.labels, voice_rules = EXCLUDED.voice_rules;