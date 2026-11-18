# send-email-newsletter rules
- The daily email's What's on block takes rows from `get_topic_whats_on` (same rules as the feed) and filters them only through the pure `pickDailyEvents` in `dailyEvents.ts` (tested); one rule set keeps the email and the feed agreeing on what's still on.
- The weekly email's "The week ahead" uses the same rows filtered by `pickBriefingEvents` in `_shared/briefingEvents.ts` (shared with the feed's weekly briefing page); a send with no stories and no events is skipped, never sent empty.
