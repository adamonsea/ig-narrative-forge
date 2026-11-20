import { useState } from "react";
import { useCountUp } from "@/hooks/useCountUp";
import { optimizeImageUrl } from "@/lib/imageOptimization";
import { InfoHint } from "@/components/ui/editorial";
import { WorkspaceDrawer } from "@/components/workspace/WorkspaceDrawer";
import { bestStories, bestStoryLine, sentSplit, sentTotal, storyDetailRows, type EngagementStory, type SentToSources } from "@/lib/readerStats";

const fmt = (v: number) => v.toLocaleString("en-GB");

function Count({ value, className }: { value: number; className?: string | undefined }) {
  const v = useCountUp(value);
  return <span className={`tabular-nums ${className ?? ""}`}>{fmt(v)}</span>;
}

function Thumb({ story, className }: { story: EngagementStory; className: string }) {
  if (!story.image) return <div className={`${className} flex items-center justify-center bg-primary`}><span className="h-2 w-2 rounded-full bg-mint" /></div>;
  return <img src={optimizeImageUrl(story.image, { width: 240, quality: 70 }) || story.image} alt="" loading="lazy" decoding="async" className={`${className} object-cover`} />;
}

/** Per-story detail, opened from Best stories. Shown on /design. */
export function StoryDetailDrawer({ story, onClose, href }: { story: EngagementStory | null; onClose: () => void; href?: string | undefined }) {
  return (
    <WorkspaceDrawer open={!!story} onOpenChange={(o) => { if (!o) onClose(); }} title={story?.title ?? ""} size="md">
      {story && (
        <>
          {story.image && <Thumb story={story} className="aspect-[16/9] w-full rounded-xl" />}
          <dl className="divide-y divide-border">
            {storyDetailRows(story).map((r) => (
              <div key={r.label} className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-base text-muted-foreground">{r.label}</dt>
                <dd className="text-base font-semibold tabular-nums">{r.value}</dd>
              </div>
            ))}
          </dl>
          {href && <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">Open story</a>}
        </>
      )}
    </WorkspaceDrawer>
  );
}

export interface ReadershipLinesProps {
  readers: number;
  returning: number;
  stories: EngagementStory[];
  sent: SentToSources | null | undefined;
  storyHref?: ((id: string) => string | undefined) | undefined;
}

/**
 * Readership in three lines: readers this week (and how many came back), best stories, sent to sources.
 * Every figure comes from get_topic_readership (the one reader definition). Shown on /design.
 */
export function ReadershipLines({ readers, returning, stories, sent, storyHref }: ReadershipLinesProps) {
  const [open, setOpen] = useState<EngagementStory | null>(null);
  const best = bestStories(stories);
  const total = sentTotal(sent);
  const split = sentSplit(sent);

  return (
    <div className="space-y-12">
      <section aria-label="Readers this week">
        {readers > 0 ? (
          <>
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <Count value={readers} className="text-[32px] font-semibold leading-none tracking-tight" />
              <span className="text-base">{readers === 1 ? "reader" : "readers"} this week</span>
            </p>
            {returning > 0 && (
              <p className="mt-3 flex items-center gap-2 text-base font-medium text-pop settle-in">
                <span className="h-2 w-2 rounded-full bg-pop" aria-hidden="true" />
                <Count value={returning} /> came back
              </p>
            )}
          </>
        ) : (
          <p className="text-base text-muted-foreground">No readers yet this week</p>
        )}
      </section>

      {best.items.length > 0 && (
        <section aria-labelledby="best-stories-t" className="space-y-4">
          <h3 id="best-stories-t" className="text-lg font-semibold">Best stories</h3>
          <ol className="-mx-2 space-y-2">
            {best.items.map((s, i) => (
              <li key={s.id} className="settle-in" style={{ animationDelay: `${i * 60}ms` }}>
                <button type="button" onClick={() => setOpen(s)}
                  className="group flex w-full items-center gap-4 rounded-xl p-2 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <Thumb story={s} className="h-12 w-16 shrink-0 rounded-lg" />
                  <span className="min-w-0">
                    <span className="block text-base leading-snug line-clamp-2">{s.title}</span>
                    <span className="mt-1 block text-sm tabular-nums text-muted-foreground">{bestStoryLine(s, best.by)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      <section aria-label="Sent to sources">
        <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <Count value={total} className="text-2xl font-semibold leading-none" />
          <span className="text-base">sent to sources</span>
          {split && <InfoHint label="Where readers went">{split}</InfoHint>}
        </p>
      </section>

      <StoryDetailDrawer story={open} onClose={() => setOpen(null)} href={open ? storyHref?.(open.id) : undefined} />
    </div>
  );
}
