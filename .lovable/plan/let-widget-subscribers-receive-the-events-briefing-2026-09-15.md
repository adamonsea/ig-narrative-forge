# Let widget subscribers receive the events briefing

## The problem (confirmed)

Anyone who subscribes through an embedded widget is recorded as a **daily** email
reader — the widget form has no choice. The "What's on this week" events section
only exists in the **weekly** email. So Chamber-widget readers, the exact audience
the events ingestion was built for, can never receive an events email.

This needs a decision because there are two reasonable answers.

## Option A — let the widget ask for weekly (recommended)

Add a cadence choice to the widget subscribe form.

- Widget builder (Widgets.tsx and the public builder) gets a "Email frequency"
  setting: Daily highlights (current default) or Weekly briefing.
- The embed snippet carries the choice; widget.js sends it instead of the
  hardcoded daily value, and shows it as a small label on the form so readers
  know what they are signing up for.
- The Chamber embed is set to weekly, so its readers get the news-plus-events
  briefing with their custom intro.
- Existing widget subscribers stay daily. A one-off switch for the existing
  Chamber sign-ups can be run separately if wanted.

## Option B — put events in the daily email too

Add the events section to the daily template and include it for segments that
have events switched on. Every daily email then carries "What's on this week",
repeated each day of the week. Less work, but repetitive for readers.

## Technical notes

- public/widget.js: replace `notificationType: 'daily'` in the subscribe POST
  with a value read from `container.dataset.frequency` (default `daily`); bump
  to v1.4.2 and keep backwards compatibility for embeds without the attribute.
- src/pages/Widgets.tsx and the public widget builder: add the frequency select,
  include `data-frequency` in the generated snippet, no schema change needed.
- No database or send-pipeline change: send-email-newsletter already filters on
  `notification_type` and already gates events on weekly plus the segment's
  include_events flag.
