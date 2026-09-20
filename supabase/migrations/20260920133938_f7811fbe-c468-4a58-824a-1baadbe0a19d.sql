-- Tighten system_logs insert: bind to the caller's user_id (service role bypasses RLS and keeps writing freely)
DROP POLICY IF EXISTS "System logs insert by authenticated users" ON public.system_logs;
CREATE POLICY "System logs insert by authenticated users"
  ON public.system_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

-- Tighten carousel exports upload: bind storage objects to their owner
DROP POLICY IF EXISTS "Authenticated users can upload carousel exports" ON storage.objects;
CREATE POLICY "Authenticated users can upload carousel exports"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'exports' AND owner_id = (select auth.uid()::text));