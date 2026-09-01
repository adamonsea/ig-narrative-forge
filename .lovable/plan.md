# Subscribe CTA in embeddable widgets

Add an optional email-subscribe box to the embeddable widget, so readers on third-party sites can sign up for feed briefing emails without leaving the page.

## What the reader sees

- A slim footer row inside the widget: "Get the highlights by email" with an email input and a Subscribe button (compact layout stacks it; wide layout puts it alongside the "stories this week" link).
- Optional frequency choice is kept out of the widget for simplicity — signups default to the feed's daily briefing (matching the feed's inline card default). Copy stays short to keep the widget small.
- On submit: inline spinner, then a "Check your inbox to confirm" confirmation replacing the form. The subscribed state is remembered per feed in localStorage so returning visitors don't see the form again.
- Errors (invalid email, rate limited, feed not public) show inline in the widget, not as an alert.

## What the feed owner controls

In both widget builders (dashboard Widgets page and the public widget builder), a new "Show subscribe box" toggle, on by default only when explicitly enabled. It emits a `data-subscribe="true"` attribute in the copied embed snippet.

Two existing gaps fixed in the same pass:

- **Custom logo/icon is missing from the dashboard widget builder.** The public builder at `/widget-builder` still has the upload-or-paste avatar control (`data-avatar`), but the dashboard Widgets page never got it. Port that control across — upload via the existing `widget-avatar-upload` function, URL validation, preview, and remove button — along with the custom title and width options the public builder already supports, so the two builders match.
- **"Powered by Curatr" attribution becomes mandatory.** The dashboard builder's "Show Attribution" toggle is removed (the widget script already renders attribution unconditionally, so the toggle did nothing). Attribution stays hard-coded in `widget.js` for both layouts, with no data attribute able to suppress it.


## Technical notes

- `public/widget.js`: render a subscribe form (Shadow DOM, existing style system, accent colour), read `data-subscribe`, POST to the existing `secure-newsletter-signup` edge function (already `verify_jwt = false`, CORS `*`, rate limited, email-validated). Reuse the existing analytics helper to record a `subscribe` event via `widget-analytics`. Bump `WIDGET_VERSION`.
- `supabase/functions/widget-feed-data/index.ts`: include `id: topic.id` in the returned `feed` object so the widget can pass `topicId` to the signup endpoint. Topic ids are already public via the feed pages, and the signup function independently re-checks that the topic exists and `is_public`.
- `supabase/functions/widget-analytics/index.ts`: allow the `subscribe` event type if the current handler validates against a fixed list, so widget analytics can report subscribe counts.
- `src/pages/dashboard/Widgets.tsx` and `src/pages/PublicWidgetBuilder.tsx`: add the toggle to config state, embed-code generation, and the live preview.
- No database migration required — signups land in `topic_newsletter_signups` exactly as feed signups do, including the existing confirmation email flow.

## Out of scope for this pass

Frequency selection, name capture, and per-widget CTA copy overrides — can follow once the basic flow is live.
