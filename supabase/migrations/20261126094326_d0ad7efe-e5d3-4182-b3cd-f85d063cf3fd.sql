ALTER TABLE public.stories ADD COLUMN IF NOT EXISTS illustration_claim_id uuid, ADD COLUMN IF NOT EXISTS illustration_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_story_illustration(p_story_id uuid, p_regenerate boolean)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_claim uuid := gen_random_uuid(); v_id uuid;
BEGIN
  UPDATE public.stories SET illustration_claim_id = v_claim, illustration_claimed_at = now()
  WHERE id = p_story_id
    AND (illustration_claimed_at IS NULL OR illustration_claimed_at < now() - interval '10 minutes')
    AND (p_regenerate OR cover_illustration_url IS NULL)
  RETURNING id INTO v_id;
  RETURN CASE WHEN v_id IS NULL THEN NULL ELSE v_claim END;
END $$;

CREATE OR REPLACE FUNCTION public.release_story_illustration(p_story_id uuid, p_claim_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.stories SET illustration_claim_id = NULL, illustration_claimed_at = NULL
  WHERE id = p_story_id AND illustration_claim_id = p_claim_id;
$$;

REVOKE ALL ON FUNCTION public.claim_story_illustration(uuid, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_story_illustration(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_story_illustration(uuid, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_story_illustration(uuid, uuid) TO service_role;