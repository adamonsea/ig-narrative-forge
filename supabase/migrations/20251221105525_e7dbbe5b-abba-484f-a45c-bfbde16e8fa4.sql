-- Drop the old unique constraint that only allows one email per topic
ALTER TABLE public.topic_newsletter_signups 
DROP CONSTRAINT topic_newsletter_signups_topic_id_email_key;

-- Create a new unique constraint that allows one email per topic+type combination
CREATE UNIQUE INDEX topic_newsletter_signups_topic_email_type_key 
ON public.topic_newsletter_signups (topic_id, email, notification_type);