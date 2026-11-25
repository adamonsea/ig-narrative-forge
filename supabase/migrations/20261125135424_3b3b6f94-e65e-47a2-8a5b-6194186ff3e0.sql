REVOKE ALL ON FUNCTION public.enforce_free_feed_limit() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.billing_enforced() FROM authenticated;