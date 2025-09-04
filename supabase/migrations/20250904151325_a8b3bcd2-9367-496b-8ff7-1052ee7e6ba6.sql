-- Create RLS policy to allow users to log their own API usage
CREATE POLICY "Users can insert their own API usage"
ON public.api_usage
FOR INSERT
WITH CHECK (true);

-- Create RLS policy to allow service role to insert API usage
CREATE POLICY "Service role can insert API usage"
ON public.api_usage
FOR INSERT
TO service_role
WITH CHECK (true);