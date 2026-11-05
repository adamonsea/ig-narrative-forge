# Tenant-safe, consistent visitor stats

## In plain English
1. **Lock the stats down.** Every stats lookup will first check that the person asking owns that feed, or is an admin. If they don't, they get nothing back. Today any signed-in user could read another feed's visitors and subscribers.
2. **One meaning of "visitors".** Every dashboard number will mean the same thing: unique readers of that feed's own feed page, story pages and Play mode in the **last 7 days, today included**, counted from the main visit log. The dashboard card, topic stats page, audience card and engagement funnel will all show the same figure.
3. **Your own visits don't count.** When a feed's owner (or an admin) is signed in and opens that feed, the visit is still saved but marked as "internal". Every stat ignores internal visits.

The visit saving from the last fix stays as it is: it only adds new visits.

## What changes

### 1. Ownership checks
Each of these functions gets one shared check: the topic's owner equals the signed-in user, or the user is an admin or superadmin. This is the same rule `get_topic_live_readers` already uses.
- Topic functions:
  - `get_topic_visitor_stats`
  - `get_topic_visitor_breakdown`
  - `get_topic_engagement_funnel`
  - `get_topic_engagement_averages`
  - `get_topic_interaction_stats`
  - `get_topic_install_stats`
  - `get_topic_registrant_stats`
  - `get_topic_source_stats`
  - `get_source_health_stats`
- User functions (`get_user_dashboard_stats`, `get_site_visitor_stats`): the user ID passed in must be the signed-in user, unless the caller is an admin.
- `get_ab_test_stats`: admins only.
- If the check fails, the function returns empty results. It does not raise an error, so screens degrade quietly.
- These are shown on public feeds, so they stay open to everyone. They return only aggregate or public figures, and I'll confirm this while building:
  - `get_topic_engagement_stats`
  - `get_subscriber_leaderboard`
  - `get_topic_quiz_stats`
  - `get_swipe_insights`
  - `get_story_swipe_stats`
  - `get_swipe_mode_stories`
- `get_swipe_mode_stories` takes a user ID. I'll make it ignore any user ID that isn't the caller's.

### 2. Single visitor definition
- Add one internal helper that counts unique visitors per topic for a given time window. It uses the main visit log: feed, story and play pages, internal visits excluded, starting 6 days ago and including today.
- Rewrite the dashboard, site, topic, breakdown and funnel functions to use this helper for every visitor figure. Today those use `feed_visits`, an 8-day window or a 7-day window, depending on the screen.
- In the funnel, the "Visitors" step uses this helper. The later steps (engaged, completed) keep their current sources, limited to the same readers and window.
- Play mode will also record a visit in the main visit log, so play visits are counted. Its old log keeps working.

### 3. Excluding the owner's own visits
- Add an `is_internal` true/false field to `site_visits`, defaulting to false.
- When a visit is saved, a database step checks whether the signed-in user (if any) owns that topic or is an admin. If so, it sets `is_internal = true`. This happens on the server, so the app can't skip or fake it.
- Existing data: I'll flag past visits made from the owner's known visitor IDs where they can be matched. If they can't, history before this change may still include some owner visits.

## Test plan
- **Isolation:** check the stats functions as user A on user B's topic, and on B's user ID. Each must return empty. Repeat as an admin: real data must come back. Check both directly in the database and by signing in to the preview.
- **Same number everywhere:** for the Eastbourne feed, compare these four figures. All must match the helper's count.
  - dashboard card "visitors this week"
  - topic stats page
  - audience breakdown
  - funnel "Visitors" step
- **Owner exclusion:** signed in as the owner, open the feed and a story. Rows must be saved with `is_internal = true` and the count must not change. Opened signed out, a row is saved with `is_internal = false` and the count goes up by one.
- Add small automated database checks for the three rules: the ownership check, the 7-day window that includes today, and internal visits being excluded.

## Technical notes
- The migration uses `CREATE OR REPLACE` for each function, keeping their existing return shapes, so the app code doesn't need to change apart from Play mode.
- Admin checks use the existing `user_roles` table through `has_role`, never anything stored in the browser.
- Ownership check: `exists(select 1 from topics where id = p_topic_id and created_by = (select auth.uid())) or has_role((select auth.uid()), 'admin') or has_role((select auth.uid()), 'superadmin')`.
