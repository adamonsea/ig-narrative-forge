-- Fix security issues by ensuring RLS is enabled on all public tables with policies

-- Enable RLS on all public tables that should have it
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stories ENABLE ROW LEVEL SECURITY;  
ALTER TABLE public.slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visuals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_generation_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quality_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carousel_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_generation_tests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_duplicates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_duplicates_pending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.source_attributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_cta_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.topic_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_filters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.request_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scrape_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;