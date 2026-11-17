# Sources tab rules
- Sources tab health (green/amber/red, attention-first order) comes only from the pure rules in `src/lib/sourceHealth.ts`, fed for news by the guarded `get_topic_source_rhythm`; archiving is per feed (`topic_sources.is_active` / `event_sources.is_active`), never `content_sources.is_active`, so one feed's tidy-up never switches a shared source off for others.
