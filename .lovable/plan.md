
# Fix Broken Email Unsubscribe Links

## The Problem

The unsubscribe links in daily and weekly briefing emails point to `/feed/{slug}?unsubscribe=daily` (or `weekly`), but:

1. No frontend code reads the `?unsubscribe` query parameter
2. No backend endpoint processes unsubscribe requests
3. Clicking "Unsubscribe" just loads the feed page -- nothing happens

This is also a GDPR compliance issue: subscribers must be able to unsubscribe easily.

## The Solution

Build a secure, token-based unsubscribe flow with two parts:

### 1. Create an `unsubscribe-newsletter` edge function

A new edge function that accepts a signed unsubscribe token and deactivates the subscription. Each email will include a unique, per-subscriber unsubscribe URL so no one can unsubscribe someone else.

- Accepts a token via query param (GET request for one-click unsubscribe)
- Looks up the subscription by token
- Sets `is_active = false` on the matching `topic_newsletter_signups` row
- Returns an HTML page confirming the unsubscribe (not JSON -- this is opened in a browser)

### 2. Generate per-subscriber unsubscribe tokens

Update `send-email-newsletter/index.ts` to:
- Generate a unique unsubscribe token per recipient (using `crypto.randomUUID()`)
- Store it in a new `unsubscribe_token` column on `topic_newsletter_signups`
- Pass the full unsubscribe URL to the email template as `unsubscribeUrl`

The unsubscribe URL will be: `https://{supabase}/functions/v1/unsubscribe-newsletter?token={uuid}`

### 3. Database migration

Add an `unsubscribe_token` column to `topic_newsletter_signups`:
```sql
ALTER TABLE topic_newsletter_signups
  ADD COLUMN IF NOT EXISTS unsubscribe_token uuid DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_newsletter_unsubscribe_token
  ON topic_newsletter_signups(unsubscribe_token);
```

## Technical Details

### New file: `supabase/functions/unsubscribe-newsletter/index.ts`

- Configured with `verify_jwt = false` (public access, opened from email)
- GET handler: reads `token` from query string
- Uses service role to look up and deactivate the subscription
- Returns a simple, branded HTML confirmation page (not a redirect to the app)
- Handles edge cases: invalid token, already unsubscribed

### Modified: `supabase/functions/send-email-newsletter/index.ts`

- When fetching subscribers, also select `id` and `unsubscribe_token`
- For each recipient, build the unsubscribe URL using their token
- Pass `unsubscribeUrl` to the email template render call

### Modified: `supabase/config.toml`

- Add `[functions.unsubscribe-newsletter]` with `verify_jwt = false`

### No frontend changes needed

The current fallback URL (`/feed/{slug}?unsubscribe=...`) becomes irrelevant once proper per-subscriber URLs are passed. No need to add query-param handling to the feed page.

## Flow

1. User receives email with unsubscribe link containing their unique token
2. User clicks link, which opens the edge function URL directly
3. Edge function deactivates their subscription and shows a confirmation page
4. Done -- no login, no extra clicks required
