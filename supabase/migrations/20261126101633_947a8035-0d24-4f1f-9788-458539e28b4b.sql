DROP TRIGGER IF EXISTS trg_ai_summary_tag_on_autopilot ON public.topic_automation_settings;
DROP FUNCTION IF EXISTS public.ai_summary_tag_on_autopilot();
UPDATE public.topics SET ai_summary_tag = false WHERE ai_summary_tag = true;