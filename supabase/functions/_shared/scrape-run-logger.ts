/**
 * Best-effort recording of what happened during a scrape of one source.
 * Every call is swallowed on error — logging must never affect scraping.
 */

export interface ScrapeRunRecord {
  source_id?: string | null;
  topic_id?: string | null;
  started_at?: string;
  finished_at?: string;
  method?: string | null;
  methods_tried?: string[];
  urls_discovered?: number;
  urls_new?: number;
  articles_stored?: number;
  rejections?: Record<string, number>;
  not_modified?: boolean;
  ai_pages_used?: number;
  error_code?: string | null;
  error_detail?: string | null;
}

export async function recordScrapeRun(supabase: any, run: ScrapeRunRecord): Promise<void> {
  try {
    await supabase.from('scrape_runs').insert({
      finished_at: new Date().toISOString(),
      ...run,
      error_detail: run.error_detail ? String(run.error_detail).slice(0, 1000) : null,
    });
  } catch (error) {
    console.warn(
      `(non-fatal) could not record scrape run: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/** How many AI extraction pages have been used across the project today. */
export async function aiPagesUsedToday(supabase: any): Promise<number> {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('scrape_runs')
      .select('ai_pages_used')
      .gte('started_at', since);
    if (!Array.isArray(data)) return 0;
    return data.reduce((sum: number, row: any) => sum + (row.ai_pages_used || 0), 0);
  } catch {
    // If we cannot read the budget, behave as if it is exhausted (safe default)
    return Number.MAX_SAFE_INTEGER;
  }
}
