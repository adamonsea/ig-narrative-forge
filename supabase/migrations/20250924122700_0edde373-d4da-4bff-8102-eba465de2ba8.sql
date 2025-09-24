-- Fix critical RLS policies for financial data security (fixed version)

-- Fix user_credits RLS policies - drop all existing first
DROP POLICY IF EXISTS "Users can view their own credits" ON user_credits;
DROP POLICY IF EXISTS "Users can update their own credits" ON user_credits;
DROP POLICY IF EXISTS "Users cannot update credits directly" ON user_credits;
DROP POLICY IF EXISTS "Service role can manage all credits" ON user_credits;

-- Create secure policies for user_credits
CREATE POLICY "Users can view their own credits" 
ON user_credits FOR SELECT 
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage all credits" 
ON user_credits FOR ALL 
USING (auth.role() = 'service_role');

-- Fix credit_transactions RLS policies
DROP POLICY IF EXISTS "Users can view their own transactions" ON credit_transactions;
DROP POLICY IF EXISTS "Service role can insert transactions" ON credit_transactions;

CREATE POLICY "Users can view their own transactions" 
ON credit_transactions FOR SELECT 
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can manage transactions" 
ON credit_transactions FOR ALL 
USING (auth.role() = 'service_role');

-- Fix api_usage RLS policies - ensure complete security
DROP POLICY IF EXISTS "API usage admin read only" ON api_usage;
DROP POLICY IF EXISTS "API usage insert by service role" ON api_usage;
DROP POLICY IF EXISTS "Service role can insert API usage" ON api_usage;
DROP POLICY IF EXISTS "Users can insert their own API usage" ON api_usage;
DROP POLICY IF EXISTS "API usage admin only" ON api_usage;
DROP POLICY IF EXISTS "Service role can manage API usage" ON api_usage;

CREATE POLICY "API usage admin and service role only" 
ON api_usage FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role) OR auth.role() = 'service_role');