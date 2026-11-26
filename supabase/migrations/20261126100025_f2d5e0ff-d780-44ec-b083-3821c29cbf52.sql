ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS ai_summary_tag boolean NOT NULL DEFAULT false;

UPDATE public.topics t SET ai_summary_tag = true
FROM public.topic_automation_settings s
WHERE s.topic_id = t.id AND s.automation_mode = 'holiday';

CREATE OR REPLACE FUNCTION public.ai_summary_tag_on_autopilot()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.automation_mode = 'holiday' AND (TG_OP = 'INSERT' OR OLD.automation_mode IS DISTINCT FROM 'holiday') THEN
    UPDATE public.topics SET ai_summary_tag = true WHERE id = NEW.topic_id;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ai_summary_tag_on_autopilot() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ai_summary_tag_on_autopilot ON public.topic_automation_settings;
CREATE TRIGGER trg_ai_summary_tag_on_autopilot AFTER INSERT OR UPDATE OF automation_mode ON public.topic_automation_settings
FOR EACH ROW EXECUTE FUNCTION public.ai_summary_tag_on_autopilot();