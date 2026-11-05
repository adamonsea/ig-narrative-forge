// TEMPORARY visual check page for the dashboard feed card. Delete after screenshots.
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, MoreHorizontal } from "lucide-react";
import { FeedStatsBody, FeedStatus, type FeedCardStats } from "@/components/dashboard/FeedStatsCard";

const base: FeedCardStats = {
  topic_id: "00000000-0000-0000-0000-000000000000",
  reading_now: 3,
  reads_week: 37,
  reads_prev_week: 34,
  reads_daily: [4, 6, 3, 5, 7, 8, 4],
  first_read_date: "2026-08-01",
  top_story_id: "s1",
  top_story_title: "Pier reopens after two-year refit",
  top_story_image: null,
  top_story_reads: 12,
  subscribers_total: 76,
  subscribers_week: 2,
  email_subscribers: 61,
  push_subscribers: 15,
  registrants_total: 9,
  installs_total: 4,
  published_week: 6,
  sources_count: 8,
  arrivals_count: 21,
  readers_today: 6,
  readers_week: 15,
  readers_prev_week: 14,
  weekly_reads: [22, 28, 31, 34, 37],
  best_prior_day: 9,
  best_day_date: "2026-10-14",
  best_day_reads: 11,
  median_story_reads: 4,
  reads_total: 2884,
  published_total: 134,
  new_referrer: null,
  new_referrer_readers: null,
  return_rate_week: null,
  return_rate_prev: null,
  loyal_reader_days: 3,
  new_country: null,
  new_country_readers: null,
  top_weekday: 2,
  top_weekday_share: 0.3,
};

// Most-read story as the highlight, with a clear rise.
const mostRead: FeedCardStats = {
  ...base,
  reads_week: 37,
  reads_prev_week: 30,
  weekly_reads: [22, 28, 31, 38, 37],
  top_story_reads: 40,
  median_story_reads: 5,
  subscribers_week: 2,
};

// Quiet week: nothing earned, so the cumulative line shows instead.
const cumulative: FeedCardStats = {
  ...base,
  weekly_reads: [22, 28, 31, 38, 37],
  subscribers_total: 9,
  subscribers_week: 0,
  email_subscribers: 8,
  push_subscribers: 1,
  registrants_total: 2,
  installs_total: 1,
  top_story_id: null,
  top_story_title: null,
  top_story_reads: 0,
  median_story_reads: 0,
  reads_prev_week: 37,
  loyal_reader_days: 0,
};

// Brand-new feed: still collecting its first week.
const firstWeek: FeedCardStats = {
  ...base,
  first_read_date: "2026-11-03",
  reads_week: 12,
  reads_prev_week: 0,
  reads_daily: [3, 4, 5],
  reads_total: 12,
  published_total: 4,
  subscribers_total: 0,
  readers_week: 3,
  readers_prev_week: 0,
  top_story_id: null,
  top_story_title: null,
  top_story_reads: 0,
  median_story_reads: 0,
  loyal_reader_days: 0,
  weekly_reads: [12],
};

function PreviewCard({ stats, name }: { stats: FeedCardStats; name: string }) {
  return (
    <Card className="relative overflow-hidden group hover:shadow-md transition-shadow duration-200 bg-card border-border">
      <Link to="/dashboard" className="block" onClick={(e) => e.preventDefault()}>
        <CardContent className="p-4 md:p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden="true" className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center bg-muted text-muted-foreground font-semibold">
                {name.charAt(0)}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap">
                  <h3 className="text-lg md:text-xl font-semibold tracking-tight truncate">{name}</h3>
                  <FeedStatus live readingNow={stats.reading_now} />
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <Button variant="outline" size="sm" className="h-8">
                <ExternalLink className="w-3 h-3 mr-1.5" />
                <span className="hidden md:inline text-xs">View</span>
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <FeedStatsBody stats={stats} topicSlug="preview" topicId={stats.topic_id} feedName={name} />
        </CardContent>
      </Link>
    </Card>
  );
}

export default function CardPreview() {
  return (
    <main className="min-h-dvh bg-background p-6">
      <div className="mx-auto max-w-3xl grid gap-5">
        <PreviewCard stats={mostRead} name="Eastbourne" />
        <PreviewCard stats={cumulative} name="Eastbourne Reporter" />
        <PreviewCard stats={firstWeek} name="New Science" />
      </div>
    </main>
  );
}
