-- Eastbourne: switch off in-feed extras via its own settings (reversible; previous values all true)
UPDATE public.topic_insight_settings SET quiz_cards_enabled=false, this_time_last_month_enabled=false, parliamentary_cards_enabled=false, events_cards_enabled=false
WHERE topic_id='d224e606-1a4c-4713-8135-1d30e2d6d0c6';
UPDATE public.topics SET automated_insights_enabled=false WHERE id='d224e606-1a4c-4713-8135-1d30e2d6d0c6';
UPDATE public.topic_sentiment_settings SET keyword_cards_enabled=false, comparison_cards_enabled=false WHERE topic_id='d224e606-1a4c-4713-8135-1d30e2d6d0c6';