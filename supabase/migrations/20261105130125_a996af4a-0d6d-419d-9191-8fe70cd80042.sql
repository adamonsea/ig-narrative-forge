DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'search_sync_secret') THEN
    PERFORM vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'search_sync_secret');
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.verify_search_sync_secret(p_secret text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, vault AS $$
  SELECT p_secret IS NOT NULL AND length(p_secret) > 0 AND EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'search_sync_secret' AND decrypted_secret = p_secret)
$$;
REVOKE ALL ON FUNCTION public.verify_search_sync_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_search_sync_secret(text) TO service_role;