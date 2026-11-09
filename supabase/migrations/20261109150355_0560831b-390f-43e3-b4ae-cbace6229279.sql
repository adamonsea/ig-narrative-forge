DO $do$
DECLARE d text; d2 text;
BEGIN
  SELECT pg_get_functiondef('public.get_topic_stories_with_keywords(uuid,text[],text[],integer,integer)'::regprocedure) INTO d;
  d2 := replace(d, 'SELECT DISTINCT s.id as sid, s.created_at as s_created',
    'SELECT DISTINCT s.id as sid, s.created_at as s_created,
      (CASE WHEN sac.published_at IS NULL THEN s.created_at
            WHEN sac.published_at > now() - interval ''3 days'' THEN s.created_at
            ELSE sac.published_at END) as s_display');
  d2 := replace(d2, E'    ORDER BY s.created_at DESC\n    LIMIT p_limit', E'    ORDER BY s_display DESC, s.id DESC\n    LIMIT p_limit');
  d2 := replace(d2, 'ORDER BY s.created_at DESC, sl.slide_number ASC;', 'ORDER BY si.s_display DESC, si.sid DESC, sl.slide_number ASC;');
  IF d2 = d OR position('s_display DESC, s.id DESC' in d2) = 0 OR position('si.sid DESC, sl.slide_number' in d2) = 0 THEN
    RAISE EXCEPTION 'keywords function edit did not apply';
  END IF;
  EXECUTE d2;

  SELECT pg_get_functiondef('public.get_public_topic_feed(text,integer,integer,text)'::regprocedure) INTO d;
  d2 := replace(d, E'    ORDER BY s_display DESC\n    LIMIT p_limit', E'    ORDER BY s_display DESC, s.id DESC\n    LIMIT p_limit');
  d2 := replace(d2, 'ORDER BY si.s_display DESC, sl.slide_number ASC;', 'ORDER BY si.s_display DESC, si.sid DESC, sl.slide_number ASC;');
  IF position('s_display DESC, s.id DESC' in d2) = 0 OR position('si.sid DESC, sl.slide_number' in d2) = 0 THEN
    RAISE EXCEPTION 'public feed edit did not apply';
  END IF;
  EXECUTE d2;
END $do$;