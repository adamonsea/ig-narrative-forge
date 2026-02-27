-- Reactivate daily subscription for adamonsea@gmail.com
UPDATE topic_newsletter_signups 
SET is_active = true 
WHERE id = 'bb25fdf6-1fb5-49f2-8b6d-8716b5bf427c';

-- Verify and activate weekly subscription for adamonsea@gmail.com
UPDATE topic_newsletter_signups 
SET email_verified = true, verified_at = NOW(), is_active = true 
WHERE id = '1c902b47-f634-4d8b-a45d-873844b2bc7a';