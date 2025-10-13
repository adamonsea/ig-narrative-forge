create index if not exists idx_scrape_jobs_source_id_created_at
  on public.scrape_jobs (source_id, created_at desc);
