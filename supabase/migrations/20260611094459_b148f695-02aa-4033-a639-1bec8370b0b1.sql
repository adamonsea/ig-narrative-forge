-- quiz_questions: writes happen only via edge functions; restrict manage policy to service_role
DROP POLICY IF EXISTS "Service role can manage quiz questions" ON public.quiz_questions;
CREATE POLICY "Service role can manage quiz questions"
ON public.quiz_questions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- short_links: public UPDATE policy is unused (clicks increment via service-role RPC); drop it
DROP POLICY IF EXISTS "Allow click count updates" ON public.short_links;