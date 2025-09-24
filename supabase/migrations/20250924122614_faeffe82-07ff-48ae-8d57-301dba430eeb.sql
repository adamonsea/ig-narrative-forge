-- Fix critical RLS policies for financial data security

-- Fix user_credits RLS policies - ensure users can only see their own credits
DROP POLICY IF EXISTS "Users can view their own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON user_credits;

CREATE POLICY "Users can view their own credits" 
ON user_credits FOR SELECT 
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users cannot update credits directly" 
ON user_credits FOR UPDATE 
USING (false);

-- Fix credit_transactions RLS policies - ensure users can only see their own transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON credit_transactions;

CREATE POLICY "Users can view their own transactions" 
ON credit_transactions FOR SELECT 
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert transactions" 
ON credit_transactions FOR INSERT 
WITH CHECK (auth.role() = 'service_role');

-- Fix api_usage RLS policies - restrict to admin only
DROP POLICY IF EXISTS "API usage admin read only" ON api_usage;
DROP POLICY IF EXISTS "API usage insert by service role" ON api_usage;
DROP POLICY IF EXISTS "Service role can insert API usage" ON api_usage;
DROP POLICY IF EXISTS "Users can insert their own API usage" ON api_usage;

CREATE POLICY "API usage admin only" 
ON api_usage FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage API usage" 
ON api_usage FOR ALL 
USING (auth.role() = 'service_role');

-- Fix function search paths for security
ALTER FUNCTION public.rescore_articles_for_topic(uuid) SET search_path = 'public';
ALTER FUNCTION public.update_error_tickets_updated_at() SET search_path = 'public';
ALTER FUNCTION public.update_daily_content_availability_updated_at() SET search_path = 'public';
ALTER FUNCTION public.auto_publish_active_topics() SET search_path = 'public';
ALTER FUNCTION public.get_topic_sources(uuid) SET search_path = 'public';
ALTER FUNCTION public.update_topic_sources_updated_at() SET search_path = 'public';
ALTER FUNCTION public.validate_article_word_count() SET search_path = 'public';
ALTER FUNCTION public.auto_populate_content_queue() SET search_path = 'public';