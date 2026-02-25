

## Fix: Make the inline email signup card clearly say "email"

The `InlineEmailSignupCard` heading currently says "Get the {topicName} briefing" which doesn't communicate that this is an **email** subscription. The user wants it to be explicit.

### Change

In `src/components/feed/InlineEmailSignupCard.tsx`, line 101:

**Before:** `Get the {topicName} briefing`
**After:** `Get the {topicName} briefing in your inbox`

Single line change. Clear, concise, and immediately communicates email delivery.

