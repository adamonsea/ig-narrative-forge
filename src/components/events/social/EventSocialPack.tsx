import { useEffect, useRef, useState } from "react";
import { Copy, Film, Image as ImageIcon, LayoutTemplate, Loader2, Play } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { InlineError } from "@/components/ui/editorial";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { eventCaption, type SocialEvent } from "./eventCaption";
import { H, SAFE, W } from "./posterLayout";
import {
  MOTION_SECONDS, assetFileName, downloadBlob, drawPosterFrame, playPoster, preparePoster,
  renderEventMotion, renderEventStill, type PreparedPoster, type RenderOpts,
} from "./renderEventCard";

/** The feed's name, colour, link and currency for the assets. */
function useFeedLook(topicId?: string) {
  return useQuery({
    queryKey: ["social-feed-look", topicId],
    enabled: Boolean(topicId),
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<RenderOpts> => {
      const { data, error } = await supabase.from("topics").select("name, slug, branding_config, illustration_primary_color, event_currency").eq("id", topicId!).maybeSingle();
      if (error) throw error;
      const t = data as any;
      return {
        feedName: t?.name ?? "Curatr",
        feedUrl: `curatr.pro/feed/${t?.slug ?? ""}`,
        brandColor: t?.branding_config?.primary_color || t?.illustration_primary_color || null,
        currency: t?.event_currency ?? null,
      };
    },
  });
}

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

/** Live 9:16 preview: the finished poster, tap Play to see the motion. */
function PosterPreview({ event, look }: { event: SocialEvent; look: RenderOpts }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [prep, setPrep] = useState<PreparedPoster | null>(null);
  const [playing, setPlaying] = useState(false);
  const [guides, setGuides] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const key = [event.title, event.start_date, event.image_path, event.event_type, look.brandColor].join("|");

  useEffect(() => {
    let alive = true;
    setPrep(null);
    void preparePoster(event, look).then((p) => { if (alive) setPrep(p); });
    return () => { alive = false; stopRef.current?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx && prep && !playing) drawPosterFrame(ctx, event, look, prep, MOTION_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prep, playing, key]);

  const play = () => {
    if (!canvasRef.current || !prep) return;
    stopRef.current?.();
    setPlaying(true);
    stopRef.current = playPoster(canvasRef.current, event, look, prep, () => setPlaying(false));
  };

  return (
    <div className="flex items-end justify-center gap-2">
      <div className="relative w-48 overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: `${W} / ${H}` }}>
        <canvas ref={canvasRef} width={W} height={H} className={cn("h-full w-full", !prep && "opacity-0")} aria-label={`Poster preview: ${event.title}`} role="img" />
        {!prep && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />}
        {guides && (
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="absolute inset-x-0 top-0 bg-primary/50" style={{ height: pct(SAFE.top, H) }} />
            <div className="absolute inset-x-0 bottom-0 bg-primary/50" style={{ height: pct(SAFE.bottom, H) }} />
            <div className="absolute right-0 bg-primary/50" style={{ top: pct(SAFE.top, H), bottom: pct(SAFE.bottom, H), width: pct(SAFE.right, W) }} />
          </div>
        )}
        {prep && !playing && (
          <button type="button" onClick={play} aria-label="Play"
            className="absolute inset-0 flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-background/90 shadow-sm">
              <Play className="h-5 w-5 text-foreground" aria-hidden="true" />
            </span>
          </button>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Instagram layout" aria-pressed={guides} onClick={() => setGuides((g) => !g)}>
            <LayoutTemplate className={cn("h-5 w-5", guides ? "text-purple-bright" : "text-muted-foreground")} aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Instagram layout</TooltipContent>
      </Tooltip>
    </div>
  );
}

/** Poster preview, image and video downloads, and a caption to edit and copy. */
export function EventSocialPack({ event, topicId }: { event: SocialEvent; topicId?: string | undefined }) {
  const { data: look } = useFeedLook(topicId);
  const { toast } = useToast();
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = look ? eventCaption(event, look) : "";
  const [caption, setCaption] = useState(draft);
  useEffect(() => { setCaption(draft); }, [draft]);
  const name = assetFileName(event.title);

  const run = async (kind: "image" | "video") => {
    if (!look) return;
    setBusy(kind); setError(null);
    try {
      if (kind === "image") downloadBlob(await renderEventStill(event, look), `${name}.png`);
      else { const { blob, ext } = await renderEventMotion(event, look); downloadBlob(blob, `${name}.${ext}`); }
    } catch {
      setError(kind === "image" ? "Couldn't make the image." : "Couldn't make the video.");
    } finally { setBusy(null); }
  };

  const copyCaption = async () => {
    await navigator.clipboard.writeText(caption);
    toast({ title: "Caption copied", duration: 2000 });
  };

  return (
    <section className="space-y-3" aria-labelledby="social-pack-title">
      <h3 id="social-pack-title" className="text-lg font-semibold">Social pack</h3>
      {look ? <PosterPreview event={event} look={look} /> : <div className="mx-auto h-[341px] w-48 animate-pulse rounded-lg bg-muted" aria-hidden="true" />}
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={!look || busy !== null} onClick={() => void run("image")}>
          {busy === "image" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="mr-2 h-4 w-4" aria-hidden="true" />}Image
        </Button>
        <Button variant="outline" disabled={!look || busy !== null} onClick={() => void run("video")}>
          {busy === "video" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Film className="mr-2 h-4 w-4" aria-hidden="true" />}{busy === "video" ? "Making…" : "Video"}
        </Button>
      </div>
      <label htmlFor="social-caption" className="sr-only">Caption</label>
      <Textarea id="social-caption" value={caption} onChange={(ev) => setCaption(ev.target.value)} rows={7} className="text-sm" disabled={!look} />
      <Button variant="outline" className="w-full" disabled={!look || !caption.trim()} onClick={() => void copyCaption()}>
        <Copy className="mr-2 h-4 w-4" aria-hidden="true" />Copy caption
      </Button>
      {error && <InlineError message={error} actionLabel="Dismiss" onAction={() => setError(null)} />}
    </section>
  );
}
