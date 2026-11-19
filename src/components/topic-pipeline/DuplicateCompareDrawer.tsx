import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WorkspaceDrawer } from "@/components/workspace/WorkspaceDrawer";
import { optimizeImageUrl } from "@/lib/imageOptimization";
import { resolvePublicationName } from "@/lib/urlUtils";
import { DeskBadge, MetaLine } from "./DeskCard";
import type { PublishedStory } from "./StoryDrawer";

const source = (s: PublishedStory) => resolvePublicationName(s.publication_name, s.source_url) || "Unknown source";

function Side({ story, label, tone }: { story: PublishedStory; label: string; tone: "warning" | "pop" }) {
  const cover = story.cover_illustration_url
    ? optimizeImageUrl(story.cover_illustration_url, { width: 640, quality: 75 }) || story.cover_illustration_url
    : null;
  const slides = [...(story.slides || [])].sort((a, b) => a.slide_number - b.slide_number);
  return (
    <article className="min-w-0 space-y-3">
      <DeskBadge tone={tone}>{label}</DeskBadge>
      {cover ? (
        <img src={cover} alt="" className="aspect-video w-full rounded-lg bg-muted object-cover" loading="lazy" />
      ) : (
        <div className="aspect-video w-full rounded-lg bg-muted" aria-hidden="true" />
      )}
      <h3 className="text-lg font-semibold leading-snug">{story.title || story.headline || "Untitled"}</h3>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <MetaLine parts={[source(story), formatDistanceToNow(new Date(story.created_at), { addSuffix: true })]} />
      </p>
      {slides.length > 0 && (
        <ol className="space-y-2 text-base leading-relaxed">
          {slides.slice(1).map((sl) => (
            <li key={sl.id}>{sl.content}</li>
          ))}
        </ol>
      )}
    </article>
  );
}

interface Props {
  waiting: PublishedStory | null;
  live: PublishedStory | null;
  onOpenChange: (open: boolean) => void;
  onSkip?: (story: PublishedStory) => void;
  onPublish?: (story: PublishedStory) => void;
  publishing?: boolean;
}

/** Side-by-side check of a waiting story against the live story it repeats: Skip or Publish. */
export function DuplicateCompareDrawer({ waiting, live, onOpenChange, onSkip, onPublish, publishing }: Props) {
  const open = Boolean(waiting && live);
  return (
    <WorkspaceDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Duplicate live"
      srDescription="The waiting story beside the live story it repeats"
      size="xl"
      footer={waiting && (
        <>
          {onPublish && (
            <Button variant="outline" onClick={() => onPublish(waiting)} disabled={publishing}>
              {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
              Publish too
            </Button>
          )}
          {onSkip && (
            <Button onClick={() => { onSkip(waiting); onOpenChange(false); }} disabled={publishing}>
              <X className="mr-2 h-4 w-4" />Skip
            </Button>
          )}
        </>
      )}
    >
      {waiting && live && (
        <div className="grid gap-6 sm:grid-cols-2">
          <Side story={waiting} label="Waiting" tone="warning" />
          <Side story={live} label="Live" tone="pop" />
        </div>
      )}
    </WorkspaceDrawer>
  );
}
