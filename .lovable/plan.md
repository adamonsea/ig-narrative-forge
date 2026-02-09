

## Fix: Align Automated Gathering with Force Rescrape Behavior

### Problem

The automated "gather" pipeline (`universal-topic-automation`) calls the universal scraper with `forceRescrape: false`. This means if a source was scraped within its cooldown window (default 24 hours), the scraper **silently skips it** with a `skipped_cooldown` status. The manual "force rescrape" button works because it passes `forceRescrape: true`, bypassing cooldowns entirely.

This is why force rescrape successfully pulls in stories when automated gathering does not.

### Solution

Change the `universal-topic-automation` edge function to pass `forceRescrape: true` when invoking the scraper. Since the automation system already has its own scheduling logic (via `topic_automation_settings.next_run_at` and `scrape_frequency_hours`), the per-source cooldown check inside the scraper is redundant for automated runs — the automation scheduler already ensures topics are only processed when they are due.

### Changes

**1. `supabase/functions/universal-topic-automation/index.ts`**
- Line 170: Change `forceRescrape: false` to `forceRescrape: true`

**2. `supabase/functions/eezee-automation-service/index.ts`** (if still in use)
- Line 236: Change `forceRescrape: false` to `forceRescrape: true`

**3. `supabase/functions/daily-content-monitor/index.ts`** (if still in use)
- Line 175: Change `forceRescrape: false` to `forceRescrape: true`

### Why This Is Safe

The automation layer already controls when scraping happens through its own schedule (`next_run_at`). The source-level cooldown inside the scraper is a second, conflicting gate that causes legitimate automation runs to produce zero results. Removing this double-gating means automation runs will always actually scrape when triggered.

### Technical Detail

No schema changes or new files required. Three one-line edits across edge functions, followed by redeployment.

