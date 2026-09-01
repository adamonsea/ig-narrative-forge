REVOKE ALL ON FUNCTION public.guard_topic_archive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_topic_delete() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_topic_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.run_nightly_topic_backups() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_topic_backup(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_topic_from_backup(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_topic_backup(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_topic_from_backup(uuid) TO authenticated, service_role;