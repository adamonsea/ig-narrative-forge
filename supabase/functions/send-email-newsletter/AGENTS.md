# send-email-newsletter rules
- The daily email's What's on block takes rows from `get_topic_whats_on` (same rules as the feed) and filters them only through the pure `pickDailyEvents` in `dailyEvents.ts` (tested); one rule set keeps the email and the feed agreeing on what's still on.
