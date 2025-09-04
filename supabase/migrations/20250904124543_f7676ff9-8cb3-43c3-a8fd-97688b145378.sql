-- Create user credits system
CREATE TABLE IF NOT EXISTS public.user_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  credits_balance INTEGER NOT NULL DEFAULT 0,
  total_credits_purchased INTEGER NOT NULL DEFAULT 0,
  total_credits_used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on user_credits
ALTER TABLE public.user_credits ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_credits
CREATE POLICY "Users can view their own credits" ON public.user_credits
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own credits" ON public.user_credits
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all credits" ON public.user_credits
  FOR ALL USING (auth.role() = 'service_role'::text);

-- Create credit transactions table
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('purchase', 'usage', 'refund', 'bonus')),
  credits_amount INTEGER NOT NULL,
  credits_balance_after INTEGER NOT NULL,
  description TEXT,
  related_story_id UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS on credit_transactions
ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

-- RLS policies for credit_transactions
CREATE POLICY "Users can view their own transactions" ON public.credit_transactions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all transactions" ON public.credit_transactions
  FOR ALL USING (auth.role() = 'service_role'::text);

-- Add illustration fields to stories table
ALTER TABLE public.stories 
ADD COLUMN IF NOT EXISTS cover_illustration_url TEXT,
ADD COLUMN IF NOT EXISTS cover_illustration_prompt TEXT,
ADD COLUMN IF NOT EXISTS illustration_generated_at TIMESTAMPTZ;

-- Create functions for credit management
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  p_user_id UUID,
  p_credits_amount INTEGER,
  p_description TEXT DEFAULT NULL,
  p_story_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_balance INTEGER;
    new_balance INTEGER;
    transaction_id UUID;
BEGIN
    -- Get current balance with row lock
    SELECT credits_balance INTO current_balance
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;
    
    -- Check if user has enough credits
    IF current_balance IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'User credits record not found'
        );
    END IF;
    
    IF current_balance < p_credits_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Insufficient credits',
            'current_balance', current_balance,
            'required', p_credits_amount
        );
    END IF;
    
    -- Calculate new balance
    new_balance := current_balance - p_credits_amount;
    
    -- Update user credits
    UPDATE user_credits
    SET 
        credits_balance = new_balance,
        total_credits_used = total_credits_used + p_credits_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
    
    -- Log transaction
    INSERT INTO credit_transactions (
        user_id,
        transaction_type,
        credits_amount,
        credits_balance_after,
        description,
        related_story_id
    ) VALUES (
        p_user_id,
        'usage',
        p_credits_amount,
        new_balance,
        p_description,
        p_story_id
    ) RETURNING id INTO transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', transaction_id,
        'credits_deducted', p_credits_amount,
        'new_balance', new_balance
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_user_credits(
  p_user_id UUID,
  p_credits_amount INTEGER,
  p_transaction_type TEXT DEFAULT 'purchase',
  p_description TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_balance INTEGER := 0;
    new_balance INTEGER;
    transaction_id UUID;
BEGIN
    -- Insert or update user credits
    INSERT INTO user_credits (user_id, credits_balance, total_credits_purchased)
    VALUES (p_user_id, p_credits_amount, 
            CASE WHEN p_transaction_type = 'purchase' THEN p_credits_amount ELSE 0 END)
    ON CONFLICT (user_id) 
    DO UPDATE SET
        credits_balance = user_credits.credits_balance + p_credits_amount,
        total_credits_purchased = CASE 
            WHEN p_transaction_type = 'purchase' 
            THEN user_credits.total_credits_purchased + p_credits_amount
            ELSE user_credits.total_credits_purchased
        END,
        updated_at = now()
    RETURNING credits_balance INTO new_balance;
    
    -- Log transaction
    INSERT INTO credit_transactions (
        user_id,
        transaction_type,
        credits_amount,
        credits_balance_after,
        description
    ) VALUES (
        p_user_id,
        p_transaction_type,
        p_credits_amount,
        new_balance,
        p_description
    ) RETURNING id INTO transaction_id;
    
    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', transaction_id,
        'credits_added', p_credits_amount,
        'new_balance', new_balance
    );
    
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;