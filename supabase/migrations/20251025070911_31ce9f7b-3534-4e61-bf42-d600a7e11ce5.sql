-- Update story_interactions constraint to allow donation-related interaction types
ALTER TABLE public.story_interactions 
DROP CONSTRAINT IF EXISTS story_interactions_interaction_type_check;

ALTER TABLE public.story_interactions 
ADD CONSTRAINT story_interactions_interaction_type_check 
CHECK (interaction_type IN (
  'swipe', 
  'share_click', 
  'donation_button_clicked', 
  'donation_modal_opened', 
  'donation_tier_clicked'
));