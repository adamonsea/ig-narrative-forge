# Security Model — Curatr (eeZee News)

This document describes the access-control model as implemented today, grounded in the live Row-Level Security (RLS) policies, `SECURITY DEFINER` functions, and edge-function authentication helpers. It is intended for developers extending the platform.

---

## 1. Identity, roles, and ownership

- **Authentication** is provided by Supabase Auth (email/password + magic link). The current user is exposed in the frontend via the `useAuth` hook (`user`, `session`, `userRole`, `isAdmin`, `isSuperAdmin`, `isProductOwner`).
- **Roles** are stored in a dedicated `public.user_roles` table (`app_role` enum: `superadmin`, `admin`, `user`). Roles are **never** stored on profile/user tables — this prevents privilege-escalation via row updates.
- **Ownership** is expressed through `topics.created_by`. Most domain data (articles, stories, slides, sentiment, analytics) is reachable by joining back to the owning topic.
- **Product-owner gating**: a small set of capabilities is restricted in the frontend to a single owner account on top of the role check.

## 2. Row-Level Security (RLS)

RLS is enabled across the `public` schema. Policies follow a consistent shape:

- **Service role** always has full access (`auth.role() = 'service_role'`) — this is how edge functions perform privileged work.
- **Admins** are granted via the `has_role(auth.uid(), 'admin')` security-definer function.
- **Topic owners** are granted via an `EXISTS` join to `topics` on `created_by = auth.uid()`.
- **Public/anon reads** are scoped to genuinely public content only (e.g. published stories and their articles/slides via helper predicates like `article_is_public(id)`).

### Representative policies (live)

| Table | Read (SELECT) | Write |
| --- | --- | --- |
| `articles` | Public predicate for published-story articles; authenticated owners/admins for the rest | Insert/update/delete restricted to service role, admins, or topic owner |
| `stories` / `slides` | Public when parent story `is_published = true`; owners/admins otherwise | Service role / owner / admin |
| `quiz_responses` | Own rows (`user_id = auth.uid()`) or admin — **not world-readable** | Anyone may INSERT (anonymous quiz answers) |
| `topic_newsletter_signups` | Owner/admin only | Inserted server-side via edge function |
| `shared_article_content` | Authenticated users only (not anon) | Service role |
| `article_duplicates` | Topic owner / admin / service role | Service role |
| `subscriber_scores` | Topic owner / admin | Service role |
| `visuals` | Scoped to public/active parent topic | Service role |
| `user_roles` | Self + admin | Service role only |

### Performance convention (required)

Wrap auth calls in a subquery so Postgres evaluates them once per statement instead of once per row:

```sql
-- Good
USING ((SELECT auth.uid()) = user_id)
USING ((SELECT auth.role()) = 'service_role')

-- Avoid (re-evaluated per row → timeouts on large tables)
USING (auth.uid() = user_id)
```

## 3. SECURITY DEFINER usage

`SECURITY DEFINER` functions run with the privileges of their owner and are used in two ways:

1. **Role checks inside policies** — `has_role(_user_id uuid, _role app_role)` is `STABLE SECURITY DEFINER` with `SET search_path = public`. It reads `user_roles` without triggering recursive RLS, which is why policies can call it safely.
2. **Privileged operations** — RPCs such as `delete_story_cascade(p_story_id)` perform multi-table cascades that ordinary roles cannot.

Rules for `SECURITY DEFINER`:

- Always `SET search_path = public` (or an explicit schema) to prevent search-path hijacking.
- Keep them small and single-purpose; never accept a role/identity as a trusted argument from the client.
- **Revoke `EXECUTE` from `PUBLIC`, `anon`, and `authenticated`** for internal maintenance/cleanup/bulk functions. Only expose RPCs that are genuinely meant to be called from the app, and gate them via the calling edge function's auth checks.
- Never reintroduce recursion: a policy on table X must not call a definer function that reads X under the caller's RLS.

## 4. Edge-function authentication tiers

All privileged logic lives in Deno edge functions that use the service-role key internally. They fall into three tiers, enforced via `supabase/functions/_shared/auth.ts`:

| Tier | `verify_jwt` | Pattern | Examples |
| --- | --- | --- | --- |
| **Public** | `false` | Validate input; no identity required. Server derives trust signals (IP from `cf-connecting-ip`/`x-forwarded-for`), enforces allowlists | `secure-newsletter-signup`, `submit-quiz-response`, `topic-manifest`, `generate-og-image`, `widget-feed-data`, `shorten-url` |
| **Mixed / authenticated** | `true` (default) | `getUser(req)` → `unauthorized()` if null; then `userOwnsTopic()` / `isAdmin()` → `forbidden()` | `delete-story-cascade`, `promote-topic-article`, `mark-article-discarded`, `update-topic-keywords`, `widget-avatar-upload` |
| **Internal / cron** | `false` | `isServiceRole(req)` must be true; rejected otherwise | scheduler, cleanup, backfill, monitor functions |

Helper contract (`_shared/auth.ts`):

- `getUser(req)` — verifies the Bearer JWT against the anon client, returns `{ id, email }` or `null`.
- `isAdmin(service, userId)` — checks `user_roles`.
- `userOwnsTopic(service, userId, topicId)` — true if `topics.created_by === userId` or admin.
- `topicIdForStory(service, storyId)` — resolves the owning topic via the article/topic-article chain.
- `isServiceRole(req)` — true only when the caller presents the service-role key.
- `unauthorized()` / `forbidden()` — standard 401 / 403 JSON responses.

## 5. Developer do / don't

**Do**

- Add RLS policies in the *same* migration as every new `public` table, plus explicit `GRANT`s (PostgREST needs them; RLS alone is not enough).
- Scope new tables by topic ownership via a `topics.created_by` join, and add a `service_role` `ALL` policy for edge-function access.
- Call `getUser` + `userOwnsTopic`/`isAdmin` at the top of any mutating edge function before doing work.
- Wrap `auth.uid()` / `auth.role()` in subqueries inside policies.
- Return generic error messages to clients (`"An internal error occurred"`); log details server-side only.
- Validate and allowlist all externally supplied URLs, origins, and redirect targets; escape user input rendered into XML/SVG/HTML.

**Don't**

- Don't store roles on profiles or trust a client-supplied role/`user_id` for authorization.
- Don't ship the service-role key to the browser or pass it as a caller token — frontend uses only the anon/publishable key.
- Don't open `anon` SELECT on a table unless the data is truly public; default to `authenticated` or owner-scoped.
- Don't `GRANT EXECUTE` on internal maintenance `SECURITY DEFINER` functions to `anon`/`authenticated`.
- Don't trust client-provided IPs, emails-as-identity, or any value in the request body for access decisions.
- Don't add a CHECK constraint for time-based rules — use validation triggers instead.

## 6. What is intentionally public

- Published stories and their articles/slides (read-only) for the public feed, discovery, widgets, and SEO/bot delivery.
- Anonymous quiz submissions and engagement metrics (insert-only; reads are owner/self scoped).
- Newsletter signup (write-only via the hardened edge function; the signup table itself is owner-read).