# A simpler Curatr membership, premium triggers and credit system

## Product model

Replace the three public tiers with one clear membership:

- **Free sandbox** — create feeds, add sources, curate stories and use the editorial controls privately.
- **A small welcome allowance** — enough to complete one meaningful premium creative action before subscribing.
- **Curatr Pro: $19/month or $190/year** — unlocks publishing and every distribution channel, with a monthly creative allowance.
- **Simple credit top-ups** — available when a member needs more, without forcing a larger plan.
- Keep bespoke/team needs as a quiet contact route rather than a competing public tier.
- Existing Starter, Pro, Team subscribers remain recognised while they are moved safely to the new catalogue; no live billing changes happen until the test flow is proven.

This keeps recurring revenue for the always-running service while making extra AI usage incremental. It avoids charging credits for ordinary curation and avoids a separate paywall for every tool. The exact allowance and top-up quantity will be set only after every action's real provider cost is normalised into one credit scale; the current `1/3/7`, `2/4/8` and `10`-credit conventions are inconsistent, so promising 1,500 credits now could create a serious margin error.

## What is free, what requires Pro, and what uses credits

### Free sandbox
- Create and configure feeds.
- Add sources and collect arrivals.
- Approve, reject, edit and organise stories.
- Preview the feed privately.
- Use non-generative editorial controls.
- Spend the welcome allowance on an eligible AI preview.

### Pro membership trigger
Ask for Pro only when the owner tries to distribute or expose the feed:

- Publish or make a feed public.
- Turn on email delivery.
- Enable outward-facing RSS.
- Install or activate the website widget.
- Connect the ChatGPT/Claude feed.
- Use other public distribution controls.

### Credit trigger
Show the exact cost before a metered action, then deduct only when the action starts successfully:

- Generate or regenerate an image.
- Animate an image or create a reel.
- Generate a spoken briefing.
- Other genuinely compute-heavy AI actions already charged by the product.

Image generation remains a premium creative feature, but the welcome allowance lets a free user try it. After that allowance is spent, the prompt offers Pro rather than a disconnected dead end. Pro members who run out see the top-up option.

## Trigger experience

Build one reusable prompt so every premium entry point behaves consistently:

- Preserve the owner’s current feed, story and settings while the prompt is open.
- Explain the outcome they were trying to activate, not the billing system.
- Use one primary action: **Unlock with Pro** for distribution or **Get more credits** when a Pro member has insufficient credits.
- Let free users with welcome credits continue directly on eligible creative actions after seeing the cost.
- Return users to the interrupted action after successful checkout, with a clear confirmation.
- Make checkout recovery-safe: refreshing, closing the tab, returning on another device, or revisiting a stale success URL must never duplicate access or credits.
- If Stripe is unavailable or verification is delayed, leave the action pending, explain that payment is being confirmed, and retry safely rather than showing a false failure.
- Never block browsing, editing, curation or private preview.
- Show membership, renewal date, credit balance and **Manage or cancel** in one account area.

## Image styles

Add the requested choices alongside the existing editorial styles:

- **Cartoon** — expressive editorial cartoon, simple shapes and restrained detail.
- **Aged editorial photo** — black-and-white archival newspaper photography with visible grain and period character.
- **Anime** — editorially composed illustrated reporting, avoiding copyrighted characters or studio imitation.
- **Illustrated icon** — bold, minimal spot illustration for concise stories and utility content.

Each style gets a short plain-English label, a preview, and a purpose-built generation prompt. Location and landmark reference controls continue to apply where relevant. All server and saved-setting validation will accept the same style list.

## Credit accounting and safeguards

Make the existing wallet reliable across sign-up, subscription, renewal and failed generations:

- Grant the welcome allowance once, idempotently, after basic account verification; add rate limits so disposable accounts cannot farm generations.
- Grant the calibrated Pro allowance once per paid billing period, keyed to the Stripe subscription period so repeated checks cannot duplicate it.
- Treat the monthly allocation as a fresh allowance; show separately purchased top-up credits and preserve them across renewals.
- Spend expiring subscription credits before durable top-up credits, and state this ordering in the balance detail.
- Record every grant, deduction, refund and top-up in the transaction history with the action and related story where applicable.
- Reserve credits atomically before expensive work, settle them on success, and release the reservation on failure or timeout.
- Keep the product-owner bypass restricted to `adamonsea@gmail.com`; do not extend it to other admins.
- Add sensible automation limits and an explicit estimated daily credit use before auto-image or other recurring generation is enabled.
- Prevent simultaneous requests from overspending the same balance.
- Make server-side entitlements authoritative. Hidden buttons, client state, email addresses and local storage must never grant Pro access or credits.
- Keep an auditable immutable ledger; corrections use compensating entries rather than rewriting history.

## Commercial calibration before promises

Before publishing any credit number:

- Measure the real cost of every image quality, animation, reel, audio briefing and other metered action, including failed/retried requests.
- Define one understandable credit scale and use it everywhere; remove conflicting constants from clients and functions.
- Price the included allowance and top-ups against a target gross margin, with a buffer for provider price changes, taxes, Stripe fees and abuse.
- Simulate light, typical and heavy customers. The $19 plan must remain healthy even when the full allowance is used.
- Keep action costs remotely configurable so provider changes do not require misleading old UI or emergency code releases.
- Present an action's credit cost before confirmation and never change that quoted cost while the request is running.

## Messaging pass

Audit and align every relevant message across the homepage, account creation, feed setup, workspace, image controls, distribution settings, pricing, checkout return and account status.

Use this core language:

- **Homepage/account:** “Free to create and curate.”
- **Private workspace:** “Your feed stays private until you publish.”
- **Distribution trigger:** “Ready to share this feed? Pro unlocks publishing and every distribution channel.”
- **Creative action:** “This uses X credits. You have Y.”
- **Welcome allowance:** “You have enough credits to try your first premium image.”
- **Low balance:** “You’re running low on credits.”
- **No balance, free user:** “You’ve used your trial credits. Pro includes a monthly creative allowance.”
- **No balance, Pro user:** “Add credits to keep creating.”
- **Checkout success:** confirm both Pro access and the credit allocation.

Remove conflicting references to Starter/Team allowances, unlimited claims, “unused credits don’t roll over” language, and any suggestion that payment is required before creating or curating. Keep the copy brief and contextual rather than repeating pricing throughout the product.

## Technical implementation

- Update the shared plan catalogue, pricing page and Stripe test products/prices for the single Pro subscription and top-up product.
- Add idempotent credit-ledger fields or grant records for welcome, renewal and purchased credits; apply a migration with explicit grants and optimised RLS.
- Allocate credits only after retrieving and verifying Stripe's server-side checkout/subscription state, never from client claims. Use idempotent reconciliation on checkout return, sign-in and scheduled checks; do not add webhook dependence unless later required.
- Centralise entitlement checks so all distribution controls use the same Pro rule and all AI actions use the same balance rule.
- Extend illustration-style constants, saved-setting validation, selector UI and generation prompts together.
- Add return-to-action state around checkout and top-up flows.
- Reuse the existing plan status and customer portal entry, expanding it into the single account/credits summary.
- Preserve voucher access. Define whether each voucher grants Pro access, credits, or both, and display that plainly to the product owner when creating it.
- Add structured monitoring for checkout verification, grant failures, stuck credit reservations, negative balances and unusual account creation; alert the product owner without exposing customer or payment data.
- Add a versioned entitlement/price configuration so existing purchases remain explainable when prices or allowances change.
- Define cancellation, refund, chargeback and grace-period behaviour before launch. Cancellation keeps access until period end; refunded or disputed top-ups cannot silently leave spendable value.

## Verification

Test in Stripe test mode before any live switch:

1. New verified account receives its welcome allowance once, including repeated sign-ins and parallel requests.
2. Free user can build privately and try a credited image.
3. Every distribution entry point opens the same Pro prompt and preserves the interrupted action.
4. Pro checkout grants the calibrated allowance once and resumes the intended action.
5. Renewal grants the next allowance once; cancelled access remains valid until the paid period ends.
6. Top-up adds the purchased durable credits once.
7. Failed, duplicated and simultaneous generation requests cannot double-charge or overspend.
8. Every new image style saves, generates with its own prompt and renders correctly on mobile and desktop.
9. Vouchers, plan management and cancellation still work.
10. Old subscribers retain access during migration.
11. Copy is consistent across all entry paths and contains no obsolete tier promises.
12. Delayed verification, abandoned checkout, offline return, refunds, disputes and provider outages fail safely.
13. Keyboard, screen-reader and mobile journeys can understand and complete every prompt and checkout return.
14. Cost simulations meet the agreed margin before any allowance is advertised.

## Delivery order

1. Cost audit and one canonical credit scale.
2. Credit ledger and entitlement rules.
3. Stripe test catalogue and subscription/top-up reconciliation.
4. Shared trigger prompt and interrupted-action return flow.
5. Distribution gates.
6. Image styles and all metered creative actions.
7. Account balance/history and voucher updates.
8. Full messaging pass, accessibility review and end-to-end test-mode verification.

Live Stripe prices and public launch remain a separate final step after test purchases, renewals, cancellation and top-ups have been confirmed.
