CREATE OR REPLACE FUNCTION public.archive_old_article_bodies(cutoff_months integer DEFAULT 12)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.shared_article_content
  SET body = ''
  WHERE body IS NOT NULL
    AND length(body) > 0
    AND created_at < now() - (cutoff_months || ' months')::interval;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_old_article_bodies(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_old_article_bodies(integer) TO service_role;