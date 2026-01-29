-- Secure deduct_user_credits with authorization checks
CREATE OR REPLACE FUNCTION public.deduct_user_credits(
  p_user_id uuid, 
  p_credits_amount integer, 
  p_description text DEFAULT NULL, 
  p_story_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    calling_user_id uuid;
    is_admin boolean;
    current_balance INTEGER;
    new_balance INTEGER;
    transaction_id UUID;
BEGIN
    -- Authorization check
    calling_user_id := auth.uid();
    
    -- Allow if: user is deducting own credits OR user is admin/superadmin
    IF calling_user_id IS NULL THEN
        -- Service role calls (from edge functions) have no auth.uid()
        -- These are trusted internal calls - allow them
        NULL;
    ELSIF calling_user_id != p_user_id THEN
        -- User trying to deduct someone else's credits
        is_admin := public.has_role(calling_user_id, 'admin') OR public.has_role(calling_user_id, 'superadmin');
        IF NOT is_admin THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Cannot deduct credits from another user'
            );
        END IF;
    END IF;

    -- Get current balance with row lock
    SELECT credits_balance INTO current_balance
    FROM user_credits
    WHERE user_id = p_user_id
    FOR UPDATE;
    
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
    
    new_balance := current_balance - p_credits_amount;
    
    UPDATE user_credits
    SET 
        credits_balance = new_balance,
        total_credits_used = total_credits_used + p_credits_amount,
        updated_at = now()
    WHERE user_id = p_user_id;
    
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

-- Secure add_user_credits with authorization checks
CREATE OR REPLACE FUNCTION public.add_user_credits(
  p_user_id uuid, 
  p_credits_amount integer, 
  p_transaction_type text DEFAULT 'purchase', 
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    calling_user_id uuid;
    is_admin boolean;
    new_balance INTEGER;
    transaction_id UUID;
BEGIN
    -- Authorization check - adding credits requires admin or service role
    calling_user_id := auth.uid();
    
    IF calling_user_id IS NOT NULL THEN
        -- User-initiated call (not service role)
        is_admin := public.has_role(calling_user_id, 'admin') OR public.has_role(calling_user_id, 'superadmin');
        
        IF NOT is_admin THEN
            -- Regular users cannot add credits to anyone (including themselves)
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Only administrators can add credits'
            );
        END IF;
    END IF;
    -- Service role calls (auth.uid() IS NULL) are trusted internal calls

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