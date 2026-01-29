# Priority 2: High Priority Fixes - Security Hardening & Reliability

## Executive Summary

This plan addresses 6 high-priority issues that, while not immediately critical, pose security risks and reliability concerns that should be resolved in the near term. These are organized by risk category.

---

## Issue 1: Functions Missing `search_path` Hardening

### Problem Statement
Two `SECURITY DEFINER` functions lack explicit `SET search_path = public`, making them vulnerable to search path manipulation attacks.

### Affected Functions
| Function | Risk Level |
|----------|------------|
| `get_story_reaction_counts_batch` | Medium - public-facing data |
| `log_error_ticket` | Low - internal logging |

### Root Cause
These functions were created without the `SET search_path TO 'public'` clause that prevents attackers from injecting malicious schemas.

### Fix Implementation

```sql
-- Fix get_story_reaction_counts_batch
CREATE OR REPLACE FUNCTION public.get_story_reaction_counts_batch(story_ids uuid[])
RETURNS TABLE(story_id uuid, reaction_type text, count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    sr.story_id,
    sr.reaction_type,
    COUNT(*)::bigint as count
  FROM story_reactions sr
  WHERE sr.story_id = ANY(story_ids)
  GROUP BY sr.story_id, sr.reaction_type;
$$;

-- Fix log_error_ticket
CREATE OR REPLACE FUNCTION public.log_error_ticket(
  p_error_details text,
  p_ticket_type text DEFAULT 'error',
  p_severity text DEFAULT 'medium',
  p_source_info jsonb DEFAULT '{}'::jsonb,
  p_context_data jsonb DEFAULT NULL,
  p_stack_trace text DEFAULT NULL,
  p_error_code text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_ticket_id uuid;
BEGIN
  INSERT INTO error_tickets (
    error_details,
    ticket_type,
    severity,
    source_info,
    context_data,
    stack_trace,
    error_code
  ) VALUES (
    p_error_details,
    p_ticket_type,
    p_severity,
    p_source_info,
    p_context_data,
    p_stack_trace,
    p_error_code
  )
  RETURNING id INTO new_ticket_id;
  
  RETURN new_ticket_id;
END;
$$;
```

### Risk Mitigation
- These are additive fixes that don't change function behavior
- Only adds security hardening
- Existing callers unaffected

---

## Issue 2: Overly Permissive RLS Policies

### Problem Statement
14 tables have RLS policies with `USING (true)` or `WITH CHECK (true)` for INSERT/UPDATE/DELETE operations. While some are intentional (analytics tracking), others need review.

### Policy Categories

**Intentional Public Insert (Anonymous Tracking) - LOW RISK:**
| Table | Policy | Justification |
|-------|--------|---------------|
| `feed_clicks` | Allow anonymous click tracking | Public analytics - write-only |
| `feed_visits` | Anyone can record visits | Public analytics - write-only |
| `quiz_responses` | Anyone can insert responses | Public engagement - write-only |
| `site_visits` | Anyone can insert site visits | Public analytics - write-only |
| `story_impressions` | Anyone can record impressions | Public analytics - write-only |
| `story_interactions` | Anyone can insert interactions | Public engagement - write-only |
| `waitlist` | Anyone can join waitlist | Public signup - write-only |
| `widget_analytics` | Anyone can insert analytics | Widget tracking - write-only |

**Service Role Only - ACCEPTABLE:**
| Table | Policy | Justification |
|-------|--------|---------------|
| `automated_insight_cards` | Service role full access | Internal automation only |
| `keyword_analytics` | Service role manage | Internal analytics only |
| `newsletter_signup_rate_limits` | Service role manage | Rate limiting - internal |
| `quiz_questions` | Service role manage | Admin-generated content |
| `topic_insight_settings` | Service role full access | Topic config - internal |

**NEEDS REVIEW - POTENTIAL RISK:**
| Table | Policy | Concern |
|-------|--------|---------|
| `article_duplicates` | Insert by authenticated | Should verify ownership |
| `article_duplicates_pending` | Manageable by authenticated | Should verify topic ownership |
| `image_generation_tests` | Manageable by authenticated | Should restrict to admins |
| `quality_reports` | Manageable by authenticated | Should restrict to topic owners |

### Fix Implementation

```sql
-- Tighten article_duplicates - only allow insert for articles user owns
DROP POLICY IF EXISTS "Article duplicates insert by authenticated" ON article_duplicates;
CREATE POLICY "Article duplicates insert by authenticated" 
ON article_duplicates 
FOR INSERT 
TO authenticated
WITH CHECK (
  -- User must own the topic containing these articles
  EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON a.topic_id = t.id
    WHERE a.id IN (original_article_id, duplicate_article_id)
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- Tighten article_duplicates_pending - restrict to topic owners
DROP POLICY IF EXISTS "Duplicate detection manageable by authenticated users" ON article_duplicates_pending;

CREATE POLICY "Topic owners can view pending duplicates" 
ON article_duplicates_pending 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON a.topic_id = t.id
    WHERE a.id = original_article_id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

CREATE POLICY "Topic owners can manage pending duplicates" 
ON article_duplicates_pending 
FOR ALL 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM articles a
    JOIN topics t ON a.topic_id = t.id
    WHERE a.id = original_article_id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);

-- Restrict image_generation_tests to admins only
DROP POLICY IF EXISTS "Image generation tests manageable by authenticated users" ON image_generation_tests;
CREATE POLICY "Admins can manage image generation tests" 
ON image_generation_tests 
FOR ALL 
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'superadmin'));

-- Restrict quality_reports to topic owners
DROP POLICY IF EXISTS "Quality reports manageable by authenticated users" ON quality_reports;
CREATE POLICY "Topic owners can view quality reports" 
ON quality_reports 
FOR SELECT 
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM stories s
    JOIN topic_articles ta ON s.topic_article_id = ta.id
    JOIN topics t ON ta.topic_id = t.id
    WHERE s.id = story_id
    AND (t.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  )
);
```

### Risk Assessment
- **Low risk**: Analytics tables are write-only and don't expose data
- **Medium risk**: `article_duplicates_pending`, `quality_reports` could allow data manipulation
- **Mitigation**: Tightening policies to topic owner + admin access

---

## Issue 3: Auth Configuration Hardening

### Problem Statement
Two auth security warnings from the linter:
1. **OTP expiry too long** - Increases window for brute-force attacks
2. **Leaked password protection disabled** - Users can use known-compromised passwords

### Fix Implementation

**Action Required in Supabase Dashboard:**

1. **Reduce OTP expiry** (Settings → Auth → Email):
   - Current: Unknown (likely 3600s default)
   - Recommended: 300-600 seconds (5-10 minutes)

2. **Enable leaked password protection** (Settings → Auth → Password):
   - Toggle "Enable leaked password protection"
   - This checks passwords against HaveIBeenPwned database

### Risk Mitigation
- These are configuration changes, not code changes
- Won't affect existing logged-in users
- Only impacts new OTP requests and password changes

---

## Issue 4: Edge Function Authorization Hardening

### Problem Statement
Several edge functions lack proper JWT verification or internal-call protection per the security memory.

### Current State Analysis

**User-Facing (need JWT verification):**
| Function | Current Auth | Required |
|----------|-------------|----------|
| `suggest-keywords` | None | JWT + topic ownership |
| `suggest-content-sources` | None | JWT + topic ownership |
| `ai-event-generator` | None | JWT + topic ownership |

**Internal/Cron (need HMAC signature):**
| Function | Current Auth | Required |
|----------|-------------|----------|
| `queue-processor` | None | HMAC signature |
| `universal-topic-scraper` | None | HMAC signature |
| `sentiment-card-scheduler` | None | HMAC signature |
| `sentiment-history-snapshot` | None | HMAC signature |

### Fix Implementation - Admin Functions

For user-facing admin functions, add JWT verification:

```typescript
// Pattern for suggest-keywords, suggest-content-sources, ai-event-generator
const authHeader = req.headers.get('Authorization');
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: 'Authorization required' }),
    { status: 401, headers: corsHeaders }
  );
}

// Verify JWT and get user
const token = authHeader.replace('Bearer ', '');
const { data: { user }, error: authError } = await supabase.auth.getUser(token);

if (authError || !user) {
  return new Response(
    JSON.stringify({ error: 'Invalid token' }),
    { status: 401, headers: corsHeaders }
  );
}

// Verify topic ownership
const { topicId } = await req.json();
const { data: topic, error: topicError } = await supabase
  .from('topics')
  .select('created_by')
  .eq('id', topicId)
  .single();

if (topicError || !topic) {
  return new Response(
    JSON.stringify({ error: 'Topic not found' }),
    { status: 404, headers: corsHeaders }
  );
}

// Check ownership or admin role
const isOwner = topic.created_by === user.id;
const { data: hasAdmin } = await supabase.rpc('has_role', { 
  _user_id: user.id, 
  _role: 'admin' 
});

if (!isOwner && !hasAdmin) {
  return new Response(
    JSON.stringify({ error: 'Unauthorized: Not topic owner' }),
    { status: 403, headers: corsHeaders }
  );
}
```

### Fix Implementation - Internal/Cron Functions

For internal functions, add HMAC signature validation:

```typescript
// Add to queue-processor, universal-topic-scraper, etc.
const internalSignature = req.headers.get('x-internal-signature');
const expectedSecret = Deno.env.get('INTERNAL_API_SECRET');

// Allow service role calls (from Supabase cron)
const authHeader = req.headers.get('Authorization');
const isServiceRole = authHeader?.includes(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '');

if (!isServiceRole && internalSignature !== expectedSecret) {
  console.warn('Unauthorized internal function call attempted');
  return new Response(
    JSON.stringify({ error: 'Unauthorized' }),
    { status: 401, headers: corsHeaders }
  );
}
```

### Required Secret
Add `INTERNAL_API_SECRET` to Edge Function secrets with a strong random value.

---

## Issue 5: Extensions in Public Schema

### Problem Statement
Two extensions (`pg_trgm`, `pg_net`) are installed in the public schema instead of a dedicated extensions schema.

### Assessment
**Status: ACCEPTABLE - No action required**

Per memory `database-hardening-search-path`: "Extension placement (pg_trgm, pg_net) in the public schema is accepted as a low-risk Supabase-managed configuration."

These extensions are:
- Managed by Supabase
- Required for core functionality (text search, HTTP requests)
- Moving them could break existing functionality

---

## Issue 6: Stories Table RLS Gap

### Problem Statement
The `stories` table has only 2 RLS policies, which may be insufficient for proper access control given its central role.

### Current Policies
| Policy | Command | Condition |
|--------|---------|-----------|
| Unknown | Unknown | Need to query |

### Investigation Query
```sql
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) as using_expr
FROM pg_policy WHERE polrelid = 'stories'::regclass;
```

### Expected Policies Needed
- **Public SELECT**: For published stories in public topics
- **Owner SELECT/UPDATE/DELETE**: For topic owners managing their stories
- **Admin full access**: For admin operations
- **Service role**: For automated systems

---

## Implementation Order

| Step | Fix | Effort | Risk | Priority |
|------|-----|--------|------|----------|
| 1 | Function search_path hardening | 10 min | Low | High |
| 2 | Auth config (OTP + password) | 5 min | Low | High |
| 3 | Tighten RLS on article_duplicates | 15 min | Medium | Medium |
| 4 | Tighten RLS on quality_reports | 10 min | Medium | Medium |
| 5 | Add INTERNAL_API_SECRET | 5 min | Low | Medium |
| 6 | Add auth to suggest-* functions | 30 min | Medium | Medium |
| 7 | Add HMAC to cron functions | 30 min | Medium | Low |

**Total Estimated Time: ~2 hours**

---

## Post-Implementation Verification

### Function Hardening
- [ ] Run linter - should show 2 fewer "Function Search Path Mutable" warnings
- [ ] Test `get_story_reaction_counts_batch` still works in feed

### RLS Policies
- [ ] Verify authenticated non-admin cannot insert arbitrary article_duplicates
- [ ] Verify topic owners can still manage their own content
- [ ] Run linter - should show fewer "RLS Policy Always True" warnings

### Auth Config
- [ ] Verify OTP emails arrive with shorter expiry
- [ ] Test password change rejects "password123" or similar leaked passwords

### Edge Functions
- [ ] Test suggest-keywords returns 401 without auth
- [ ] Test suggest-keywords works with valid JWT for topic owner
- [ ] Verify cron jobs still execute (service role bypass)

---

## Dependencies on Priority 1

These fixes can proceed independently of Priority 1, with one exception:
- **Sentiment scheduler hardening** depends on fixing the keyword tracking first (otherwise no traffic to protect)

## Notes

- Extensions in public schema: Accepted risk per previous decision
- Some "true" RLS policies are intentional for public analytics tracking
- Edge function hardening should be staged: admin functions first, then cron protection
