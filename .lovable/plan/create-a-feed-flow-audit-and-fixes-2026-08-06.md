# Create-a-Feed flow: audit and fixes

The flow is well designed for low cognitive load — one field, auto-discovered sources, a build screen, a celebration. But it is not primetime ready. Three faults break it silently for ordinary (non-admin) users, and the finish screen tells people their feed is live when it is not.

## What the audit found

### 1. Sources are never actually saved (blocker)
The wizard writes each chosen source into the sources table with no topic attached. The database rule only permits that write when the row is tied to a topic you own, or you are an admin. For a normal user every source write is rejected — and the rejection is swallowed by a `console.warn`, so the wizard carries on cheerfully and builds a feed with nothing in it.

Evidence: 19 of 27 existing topics have zero linked sources; 20 have zero articles.

You would not have seen this yourself because your account is an admin, which satisfies the rule.

### 2. The new feed is private, but the last screen says "Your feed is live!"
New topics are created without setting the public flag, and the database defaults it to private. The public feed page and Discover both require public. So "View your feed" opens a blank page on a brand new feed.

### 3. The story count on the finish screen is always zero
The build screen collects the stories it finds into a local variable but hands the (still empty) state value to the finish screen. Even a successful build reports "Stories will appear as sources are scraped".

### 4. Name check gives a false all-clear
The "already exists" check can only see your own feeds and public ones. If another user has a private feed on the same slug, the name looks free, the user sits through source discovery (which costs AI credits), and the failure only surfaces on the build screen — with a "Start over" button that wipes everything they entered.

### 5. Smaller issues
- No length limit or trimming on the feed name; a name of only symbols produces an empty slug.
- The existing-source lookup uses a single-row read that errors outright when a domain matches more than one row.
- Nothing stops a double click on "Build" — it can create two topics.
- Closing the wizard mid-build abandons the topic in a half-built state with no way back to finish it.
- If discovery returns nothing the only path is "Skip — add later", and the dashboard the user lands on gives no obvious next step.
- The build screen polls for up to ~60 seconds with no cancel and no "this is taking a while" escape.
- The source pills use raw emoji as type icons with no text alternative, and the step dots have no screen-reader labelling.

## What I will change

**Fix the source write (the blocker)**
Attach the new topic to each source row at insert time so the database rule is satisfied, and create the sources after the topic exists rather than before. Stop swallowing the errors: if some sources fail, the build screen says so plainly ("3 of 5 sources connected") instead of pretending.

**Make the feed genuinely live**
Set the new topic public on creation, so "View your feed" and Discover work immediately.

**Report the real story count**
Pass the found stories through to the finish screen instead of the stale value.

**Move the name collision check server-side**
Use a small database function that can see all slugs, so the "already taken" message appears at step 1 — before any AI spend. Trim the name, cap it at 60 characters, and require a slug with at least one letter or digit.

**Harden the submit path**
Disable the build button while a create is in flight; replace the single-row source lookup with a first-match read; make "Start over" keep the typed name.

**Better dead ends**
When no sources are found, offer a "paste a website address" box inline instead of only "skip". When a build produces no stories, the finish screen explains that scraping continues in the background and links to the dashboard rather than an empty public feed.

**Accessibility**
Give the source pills a text label for their type instead of a bare emoji, add `aria-current` and a "Step 2 of 4" label to the progress dots, and make sure the wizard traps focus and closes on Escape.

Nothing above adds a field or a decision for the user — the flow stays one input, one pick-your-sources screen, a build, and a finish.

## Technical detail

- `src/components/CreateTopicDialog.tsx`: reorder `handleStep2Continue` so the topic insert happens first and each `content_sources` insert carries `topic_id`; add `is_public: true`; collect per-source failures into state; add an `isCreating` guard; replace `.maybeSingle()` on the duplicate-source lookup with a `.limit(1).maybeSingle()` first-match read; trim/cap the name and validate the derived slug.
- New security-definer function `public.check_topic_slug_available(p_slug text) returns boolean` (grant execute to `authenticated`) so step 1 sees every slug without exposing other users' topics; call it from the debounced validator.
- `src/components/FeedBuildProgress.tsx`: `onComplete(foundStories)` instead of `onComplete(stories)`; hoist `foundStories` out of the polling block; surface a partial-source message; add an overall timeout that resolves rather than hangs.
- Keep `add_source_to_topic` as the linking path — it already upserts safely.
- Post-change verification: run one create end-to-end as a non-admin test user and confirm rows land in `content_sources`, `topic_sources` and `scrape_jobs`, and that `/feed/<slug>` renders.