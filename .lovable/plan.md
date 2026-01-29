
# Priority 1 Critical Fixes - Service Integrity Plan

## Executive Summary

This plan addresses four critical issues affecting product/service integrity that need immediate resolution. These fixes are prioritized by active user impact and security risk.

---

## Issue 1: Sentiment Cards Not Updating (55+ Days Stale)

### Problem Statement
Sentiment insights in feeds are showing outdated data (last card: December 4, 2025 - 56 days ago). Users see stale "Christmas" keywords in late January.

### Root Cause Analysis
All 15+ keywords in `sentiment_keyword_tracking` have:
- `tracked_for_cards = false`
- `status = pending_review` (never approved)

The `sentiment-card-scheduler` cron runs daily but finds zero keywords to process because:
```sql
-- Scheduler query requires ALL of these conditions:
WHERE tracked_for_cards = true
  AND topic_id IN (enabled_topics)
  AND current_trend IN ('emerging', 'sustained')
```

### Fix Implementation

**Step 1: Enable tracking for relevant keywords (SQL via Insert Tool)**
```sql
UPDATE sentiment_keyword_tracking
SET 
  tracked_for_cards = true,
  status = 'active',
  updated_at = now()
WHERE topic_id = 'd224e606-1a4c-4713-8135-1d30e2d6d0c6'
  AND current_trend IN ('emerging', 'sustained')
  AND keyword_phrase NOT IN ('christmas', 'festive', 'season');
```

**Step 2: Manually trigger sentiment scheduler**
Invoke the `sentiment-card-scheduler` edge function to generate fresh cards immediately rather than waiting for the 2am cron.

**Step 3: Verify new cards appear**
Query `sentiment_cards` to confirm new entries with today's date.

### Risk Mitigation
- SQL update is additive only (enabling flags)
- If keywords generate low-quality cards, they can be hidden via `is_visible = false`
- Scheduler has built-in error handling and will skip individual keyword failures

---

## Issue 2: Credit Management Security Vulnerability

### Problem Statement
The `deduct_user_credits` and `add_user_credits` functions are `SECURITY DEFINER` but contain **no authorization checks**. Any authenticated user could potentially:
- Deduct credits from another user's account
- Add free credits to their own account

### Current Function Analysis

**`deduct_user_credits`** - Current (VULNERABLE):
```sql
-- Accepts any p_user_id with no verification
-- Called with service role by edge functions, but also exposed via RPC
```

**`add_user_credits`** - Current (VULNERABLE):
```sql
-- Accepts any p_user_id, any p_transaction_type
-- Could allow users to add 'purchase' credits without payment
```

### Fix Implementation

**Step 1: Modify `deduct_user_credits` (SQL Migration)**

```sql
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
        is_admin := has_role(calling_user_id, 'admin') OR has_role(calling_user_id, 'superadmin');
        IF NOT is_admin THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Cannot deduct credits from another user'
            );
        END IF;
    END IF;

    -- [Rest of existing logic unchanged]
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
```

**Step 2: Modify `add_user_credits` (SQL Migration)**

```sql
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
        is_admin := has_role(calling_user_id, 'admin') OR has_role(calling_user_id, 'superadmin');
        
        IF NOT is_admin THEN
            -- Regular users cannot add credits to anyone (including themselves)
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Unauthorized: Only administrators can add credits'
            );
        END IF;
    END IF;
    -- Service role calls (auth.uid() IS NULL) are trusted internal calls

    -- [Rest of existing logic unchanged]
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
```

### Authorization Logic Explained

| Caller Type | deduct_user_credits | add_user_credits |
|-------------|---------------------|------------------|
| Service role (edge functions) | Allowed (trusted internal) | Allowed (trusted internal) |
| User deducting own credits | Allowed | Blocked |
| User deducting other's credits | Blocked | Blocked |
| Admin/superadmin | Allowed for any user | Allowed for any user |

### Risk Mitigation
- `auth.uid() IS NULL` correctly identifies service role calls (edge functions)
- Existing `has_role` function is already secure with `SECURITY DEFINER`
- Users attempting exploitation will receive clear error messages
- Transaction logging unchanged - full audit trail preserved

---

## Issue 3: Newsletter Subscriber RLS Verification

### Problem Statement
Memory flagged potential privacy concerns about `topic_newsletter_signups` containing user emails.

### Current RLS Analysis (VERIFIED SECURE)

**Existing Policies:**
| Policy | Command | Condition |
|--------|---------|-----------|
| Service role can manage newsletter signups | ALL | `auth.role() = 'service_role'` |
| Topic owners can view their newsletter signups | SELECT | `topic_id IN topics WHERE created_by = auth.uid() OR has_role(auth.uid(), 'admin')` |
| Topic owners can update their newsletter signups | UPDATE | Same as above |

**Security Assessment:**
- **Anonymous users**: No SELECT policy matches - cannot read any signups
- **Regular authenticated users**: Can only see signups for topics they created
- **Admins**: Can see all signups (appropriate for admin dashboard)
- **Service role**: Full access (used by `secure-newsletter-signup` edge function)

### Fix Implementation

**Status: No changes required**

The RLS policies are correctly configured:
1. Anonymous access is blocked (no matching policy)
2. Users can only see their own topic's subscribers
3. INSERT is restricted to service role only
4. Public signups go through the validated edge function

### Verification Step
Run this query to confirm no public access:
```sql
-- Test as anon role (should return 0 rows)
SET ROLE anon;
SELECT count(*) FROM topic_newsletter_signups;
RESET ROLE;
```

---

## Issue 4: Story Illustrations Internal Call Pattern

### Problem Statement
Edge function logs showed 401 errors when `enhanced-content-generator` calls `story-illustrator`.

### Current Implementation Analysis

**`enhanced-content-generator` (lines 1154-1162):**
```typescript
const { data: illustrationData, error: carouselError } = await supabase.functions.invoke('story-illustrator', {
  body: { 
    storyId,
    forceRegenerate: true,
    skipExistingImages: false
  }
});
```

**Problem Identified:**
The `supabase` client in `enhanced-content-generator` is created with `SUPABASE_SERVICE_ROLE_KEY` (line 86), but `supabase.functions.invoke()` passes the **anon key** by default, not the service role key.

**`story-illustrator` expects:**
```typescript
const authHeader = req.headers.get('Authorization');
if (!authHeader) {
  return new Response(JSON.stringify({ error: 'Authorization header required' }), { status: 401 });
}
```

### Fix Implementation

**Modify `enhanced-content-generator/index.ts`:**

Change the illustration call to pass the service role authorization:

```typescript
// At line 1154-1162, replace the existing call with:
try {
  // Build direct fetch call with service role auth
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  
  const illustrationResponse = await fetch(
    `${supabaseUrl}/functions/v1/story-illustrator`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        storyId,
        forceRegenerate: true,
        skipExistingImages: false
      })
    }
  );
  
  if (!illustrationResponse.ok) {
    const errorText = await illustrationResponse.text();
    console.error('❌ Failed to trigger carousel generation:', {
      status: illustrationResponse.status,
      error: errorText,
      storyId
    });
  } else {
    const illustrationData = await illustrationResponse.json();
    console.log('🎨 Triggered carousel image generation successfully:', {
      storyId,
      illustrationUrl: illustrationData?.illustration_url,
      model: illustrationData?.model_used
    });
  }
} catch (carouselError) {
  console.error('❌ Unexpected error in illustration generation:', {
    error: carouselError instanceof Error ? carouselError.message : String(carouselError),
    stack: carouselError instanceof Error ? carouselError.stack : undefined,
    storyId
  });
}
```

**Alternative: Modify `story-illustrator` to accept service role calls**

If the `story-illustrator` should also accept internal calls without user auth, add service role detection:

```typescript
// In story-illustrator, after line 132
const authHeader = req.headers.get('Authorization');

// Check if this is a service role call (internal)
const isServiceRole = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'impossible');

if (!authHeader && !isServiceRole) {
  return new Response(
    JSON.stringify({ error: 'Authorization header required' }),
    { status: 401, headers: corsHeaders }
  );
}

// For service role calls, skip user auth and credit deduction
if (isServiceRole) {
  // Use service role client directly, skip credit check
  // ... proceed with illustration generation
}
```

### Risk Mitigation
- Service role key is already available in `enhanced-content-generator`
- Direct fetch with explicit auth header ensures proper authorization
- Error handling preserved - failures logged but don't break story creation
- Non-blocking pattern maintained (story saves even if illustration fails)

---

## Implementation Order

| Step | Fix | Effort | Risk | Impact |
|------|-----|--------|------|--------|
| 1 | Enable sentiment keyword tracking | 5 min | Low | High - Fresh insights |
| 2 | Trigger sentiment scheduler | 2 min | None | Immediate data refresh |
| 3 | Add auth to `deduct_user_credits` | 10 min | Medium | Security hardening |
| 4 | Add auth to `add_user_credits` | 10 min | Medium | Security hardening |
| 5 | Fix illustration internal calls | 15 min | Low | Resolve 401 errors |
| 6 | Verify newsletter RLS | 2 min | None | Confirm security |

**Total Estimated Time: ~45 minutes**

---

## Post-Implementation Verification

### Sentiment Cards
- [ ] Query `sentiment_cards` for cards with `created_at > now() - interval '1 hour'`
- [ ] Check feed display in Play Mode for fresh insights

### Credit Functions
- [ ] Test regular user cannot call `add_user_credits` via RPC
- [ ] Test user can still deduct own credits via story illustration
- [ ] Verify admin can manage any user's credits

### Illustrations
- [ ] Check `enhanced-content-generator` logs for successful illustration calls
- [ ] Verify new stories have `cover_illustration_url` populated

### Newsletter
- [ ] Confirm anon query returns 0 rows
