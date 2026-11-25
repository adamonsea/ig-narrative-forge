# Reader metrics — the one definition

Every owner-facing reader figure comes from `public.topic_reader_metrics(topic_id, from, to)`.
Other functions (`get_topic_readership`, `get_dashboard_feed_cards`, `get_topic_pulse`, `get_widget_social_proof`,
`get_topic_live_readers`, `count_topic_readers`) call it or its building blocks (`topic_engagement`, `topic_reads`) — never their own logic.

## Terms owners see
| Term | Meaning |
|---|---|
| Readers | Distinct people with an engaged action: swipe into a card, 3s+ headline stop, or 10s+ on a story page |
| Reads | Engaged story views (one per person, story and day) |
| Sign-ups | Verified email or browser-notification sign-ups, owner excluded |
| Shares | Share taps |
| Sent to sources | Taps through to the original story |

Rates (stories per visit, stop %, swipe %, drop-off) are always a share of Readers or Reads, never row-over-previous-row.

## Exclusions (applied once, inside `topic_engagement`)
Internal/owner traffic, preview hosts, `zztest_` test visitors (`is_test_visitor`), `user_agent = 'test'`, and anyone in `topic_excluded_visitors`.

## Window
Last 7 Europe/London days including today (`london_today() - 6` to `london_today()`), compared with the 7 before.
Headline-stop rows use their stored `impression_date`.

## Not shown to owners
Page loads (`site_visits`, via `count_topic_visitors`) include bots and bounces. Admin only, labelled
"Page loads (incl. bots and bounces)".

## Consistency
Admin → Site stats → "Reader figures check" runs `admin_reader_consistency()`: the dashboard card Readers must equal
the Readers tab Readers for every feed.
