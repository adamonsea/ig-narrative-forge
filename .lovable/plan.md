

# Multi-Tenant System Audit

## Audit Summary

After reviewing the codebase across routing, authentication, RLS policies, edge functions, data isolation, and the content pipeline, the system is **largely sound** with a few issues that should be addressed before opening to new users.

---

## What's Working Well

- **Data isolation**: All major tables (topics, articles, stories, content_sources, topic_articles) use RLS policies scoped via `topics.created_by = auth.uid()` or `has_role()` checks. The `user_roles` table is properly separated from profiles.
- **Edge function auth**: Critical functions (queue-processor, auto-simplify-queue, etc.) validate JWT role (`service_role` or `authenticated`) before proceeding.
- **Topic ownership**: Dashboard, TopicDashboard, and all source/pipeline components correctly filter by `created_by = user.id`.
- **Content pipeline**: Multi-tenant scraping, scoring, deduplication, and story generation are all topic-scoped. Recent fixes ensured duplicate detection and fresh-angle checks are also topic-scoped.
- **Feed access**: Public feeds (`/feed/:slug`) work for anonymous users; dashboards require authentication.

---

## Issues Found

### 1. No Route Guards on `/dashboard` and `/dashboard/topic/:slug` (Medium Priority)

**Problem**: Neither route has a proper redirect to `/auth`. Dashboard shows an "Access Denied" message inline but doesn't redirect. TopicDashboard silently fails if no user is present. Compare with `/dashboard/widgets` which correctly calls `navigate("/auth")`.

**Fix**: Add `useEffect` redirect to `/auth` when `!user && !authLoading` in both `Dashboard.tsx` and `TopicDashboard.tsx`, consistent with the Widgets page pattern.

### 2. `demoConfig.ts` Contains Hardcoded Topic IDs (Low Priority)

**Problem**: `DEMO_TOPIC_ID`, `DEMO_TOPIC_MAP`, and `DEMO_SOURCES_BY_TOPIC` hardcode your specific topic UUIDs and source IDs. This violates the universal multi-tenant constraint and will break for new users who don't have these topics.

**Fix**: The demo flow should either:
- Query the database for the user's actual topics/sources, or
- Be clearly marked as a landing-page-only demo that doesn't affect authenticated user flows (verify this is the case — if `DemoFlow` is only used on the public landing page, this is acceptable).

### 3. No Automatic Profile/Role Creation on Sign-Up (Medium Priority)

**Problem**: When a new user signs up via `supabase.auth.signUp()`, no `user_roles` row or profile record is created. The `fetchUserRole` function defaults to `'user'` if no row exists, which is fine for role checking, but there's no onboarding trigger to set up initial data.

**Fix**: Create a database trigger on `auth.users` INSERT that automatically creates a `user_roles` row with role `'user'` and any necessary profile scaffolding. Alternatively, handle this in the `AuthProvider` when a new session is first detected.

### 4. `content_sources` RLS May Block New Users (Medium Priority)

**Problem**: The `content_sources` SELECT policy requires either topic ownership, region access, or admin role. A brand new user with no topics would see nothing — which is correct — but when they create their first topic and add sources, the INSERT path needs verification. The `handleAddSource` in `UnifiedSourceManager` creates sources and links them to topics, but the RLS INSERT policy should be checked to ensure it allows users to insert sources for their own topics.

**Fix**: Verify the INSERT policy on `content_sources` allows `authenticated` users to insert rows where `topic_id` belongs to a topic they own. If missing, add it.

### 5. Admin Route Has No Role Check (Low Priority)

**Problem**: `/admin` renders `AdminPanel` which checks `if (!user)` but doesn't verify `isAdmin`. Any authenticated user could potentially access admin UI (though RLS would prevent data access, the UI exposure is undesirable).

**Fix**: Add `if (!isAdmin) return <Navigate to="/dashboard" />` in `AdminPanel`.

---

## What Doesn't Need Changing

- **RLS policies**: Well-structured with `has_role()` security definer function, subquery-wrapped `auth.uid()` for performance
- **Edge function secrets**: Properly using environment variables, not client-side
- **Multi-tenant pipeline**: Scraping, scoring, deduplication, story generation all correctly topic-scoped
- **Auth storage**: Role checks use `user_roles` table (not localStorage) — secure pattern
- **Credit system**: Properly server-side via RPCs

---

## Recommended Implementation Order

1. **Add route guards** to Dashboard and TopicDashboard (quick, prevents confusion for unauthenticated visitors)
2. **Add admin role check** to AdminPanel (quick security fix)
3. **Add auto user_roles creation** on signup (ensures clean new user experience)
4. **Verify content_sources INSERT RLS** (prevents new users from being blocked when adding sources)
5. **Audit demoConfig usage** to confirm it's landing-page only (no code change if confirmed)

