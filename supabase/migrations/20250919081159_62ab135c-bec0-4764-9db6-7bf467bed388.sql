-- Test: call enhanced-content-generator on a pending queue item
SELECT net.http_post(
    url := 'https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1/enhanced-content-generator',
    headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwb3l3a2pnZGFwZ2p0ZGVvb2FrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1NTUxNTM0OSwiZXhwIjoyMDcxMDkxMzQ5fQ.vQgVmLdy2_nu8EWq4TQfk8-jEIttI0d1Kht7Nsdv_v0'
    ),
    body := jsonb_build_object(
        'articleId', (SELECT article_id FROM content_generation_queue WHERE status = 'pending' LIMIT 1),
        'slideType', 'tabloid',
        'aiProvider', 'deepseek',
        'tone', 'conversational',
        'audienceExpertise', 'intermediate'
    )
) as response;