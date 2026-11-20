import { Bell, ChevronDown, Hash, MapPin, Menu } from "lucide-react";
import { FeedViewToggle } from "@/components/feed/FeedViewToggle";
import { eventIllustrationTint, toCss } from "@/lib/feedBrandColor";
import { feedSurfaceStyles, livePillTone, type SurfaceChoice } from "@/lib/feedSurfaces";
import type { StoryCoverStyle } from "@/lib/storyCoverStyle";
import { cn } from "@/lib/utils";

export interface FeedLookPreviewProps {
  name: string;
  welcome?: string | null | undefined;
  logoUrl?: string | null | undefined;
  brand?: string | null | undefined;
  topBar?: SurfaceChoice;
  background?: SurfaceChoice;
  coverStyle: StoryCoverStyle;
  regional?: boolean | undefined;
  showToggle?: boolean | undefined;
  /** Rendered width in px; the phone is drawn at 375px and scaled to fit. */
  width?: number | undefined;
}

const STAGE_W = 375;
const STAGE_H = 760;

/** A story card sketch: picture and headline shapes, in the chosen cover style. */
function StorySketch({ coverStyle, tint, short }: { coverStyle: StoryCoverStyle; tint: string; short?: boolean }) {
  if (coverStyle === "full-bleed") {
    return (
      <div className={cn("feed-card relative w-full overflow-hidden rounded-xl", short ? "h-40" : "h-[420px]")} style={{ background: tint }}>
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-feed-cover-ink via-feed-cover-ink/80 to-transparent" />
        <div className="absolute inset-x-5 bottom-6 space-y-2.5">
          <span className="block h-2 w-20 rounded-full bg-feed-cover-text/60" />
          <span className="block h-4 w-full rounded-full bg-feed-cover-text/95" />
          <span className="block h-4 w-4/5 rounded-full bg-feed-cover-text/95" />
          <span className="block h-4 w-3/5 rounded-full bg-feed-cover-text/95" />
        </div>
      </div>
    );
  }
  return (
    <div className="feed-card w-full overflow-hidden rounded-xl">
      <div className={short ? "h-40" : "h-52"} style={{ background: tint }} />
      {!short && (
        <div className="space-y-2.5 p-5">
          <span className="block h-2 w-20 rounded-full bg-current opacity-30" />
          <span className="block h-4 w-full rounded-full bg-current opacity-85" />
          <span className="block h-4 w-4/5 rounded-full bg-current opacity-85" />
          <span className="block h-4 w-3/5 rounded-full bg-current opacity-85" />
          <span className="mt-4 block h-2 w-28 rounded-full bg-current opacity-30" />
        </div>
      )}
    </div>
  );
}

/**
 * A live, scaled phone drawing of a feed's top of page: the same surface rules
 * and the same view switch as the real feed, so what owners pick is what readers see.
 */
export function FeedLookPreview({
  name, welcome, logoUrl, brand, topBar, background, coverStyle, regional, showToggle, width = 270,
}: FeedLookPreviewProps) {
  const surfaces = feedSurfaceStyles({ topBar, background, brand });
  const live = livePillTone(surfaces.customTopBar);
  const tint = toCss(eventIllustrationTint(brand));
  const scale = width / STAGE_W;

  return (
    <div
      className="overflow-hidden rounded-[2rem] border-[6px] border-primary shadow-lg"
      style={{ width: width + 12, height: STAGE_H * scale + 12 }}
      role="img"
      aria-label={`Preview of ${name}`}
    >
      <div
        aria-hidden="true"
        inert
        className="feed-background origin-top-left"
        style={{ ...surfaces.root, width: STAGE_W, height: STAGE_H, transform: `scale(${scale})` }}
      >
        <div className="relative border-b border-border bg-background px-4 pb-8 pt-14 text-center text-foreground" style={surfaces.header}>
          <span className={cn("absolute left-4 top-4 flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold", live.pill)}>
            <span className={cn("h-2 w-2 rounded-full", live.dot)} />
            Live
          </span>
          {logoUrl ? (
            <img src={logoUrl} alt="" className="mx-auto h-[68px] max-w-[280px] object-contain" />
          ) : (
            <div className="flex items-center justify-center gap-2">
              {regional ? <MapPin className="h-6 w-6 text-primary" /> : <Hash className="h-6 w-6 text-primary" />}
              <span className="text-2xl font-bold text-primary">{name}</span>
            </div>
          )}
          {welcome && <p className="mx-auto mt-5 max-w-[300px] text-base text-muted-foreground">{welcome}</p>}
          <div className="mt-6 flex items-center justify-center gap-2">
            <span className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <Bell className="h-4 w-4" />
              <span className="text-sm font-medium">Subscribe</span>
              <ChevronDown className="h-3 w-3 opacity-60" />
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
              <Menu className="h-4 w-4" />
            </span>
          </div>
        </div>
        <div className="space-y-6 px-4 pt-8">
          {showToggle && <FeedViewToggle value="all" onChange={() => {}} brandColor={brand} />}
          <StorySketch coverStyle={coverStyle} tint={tint} />
          <StorySketch coverStyle={coverStyle} tint={tint} short />
        </div>
      </div>
    </div>
  );
}
