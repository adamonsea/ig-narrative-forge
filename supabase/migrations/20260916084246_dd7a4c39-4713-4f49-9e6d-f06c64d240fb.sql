-- Coverage workspace setup-progress state.
-- landmark_setup_state: per place { "<name>": { status: "suggested" | "confirmed" }, dismissed: { "<name>": true } }
-- coverage_setup_state: { dismissedSuggestions: { "<term>": true }, pictureReferencesNudgeDismissed: true }
ALTER TABLE public.topics
  ADD COLUMN IF NOT EXISTS landmark_setup_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS coverage_setup_state jsonb NOT NULL DEFAULT '{}'::jsonb;