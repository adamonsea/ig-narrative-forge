REVOKE EXECUTE ON FUNCTION public.has_pro_access(uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.reserve_user_credits(uuid, integer, text, text, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.settle_credit_reservation(uuid, text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.release_credit_reservation(uuid, text, text) FROM authenticated;
ALTER FUNCTION public.set_topic_distribution(uuid, text, boolean) SECURITY INVOKER;