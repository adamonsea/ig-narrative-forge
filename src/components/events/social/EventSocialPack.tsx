import { useState } from "react";
import { Copy, Film, Image as ImageIcon, Loader2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { InlineError } from "@/components/ui/editorial";
import { useToast } from "@/hooks/use-toast";
import { eventCaption, type SocialEvent } from "./eventCaption";
import { assetFileName, downloadBlob, renderEventMotion, renderEventStill, type RenderOpts } from "./renderEventCard";

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

/** Image, motion video and caption for one event, ready to post. */
export function EventSocialPack({ event, topicId }: { event: SocialEvent; topicId?: string }) {
  const { data: look } = useFeedLook(topicId);
  const { toast } = useToast();
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    if (!look) return;
    await navigator.clipboard.writeText(eventCaption(event, look));
    toast({ title: "Caption copied", duration: 2000 });
  };

  return (
    <section className="space-y-3" aria-labelledby="social-pack-title">
      <h3 id="social-pack-title" className="text-lg font-semibold">Social pack</h3>
      <div className="grid grid-cols-3 gap-2">
        <Button variant="outline" disabled={!look || busy !== null} onClick={() => void run("image")}>
          {busy === "image" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <ImageIcon className="mr-2 h-4 w-4" aria-hidden="true" />}Image
        </Button>
        <Button variant="outline" disabled={!look || busy !== null} onClick={() => void run("video")}>
          {busy === "video" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Film className="mr-2 h-4 w-4" aria-hidden="true" />}{busy === "video" ? "Making…" : "Video"}
        </Button>
        <Button variant="outline" disabled={!look} onClick={() => void copyCaption()}>
          <Copy className="mr-2 h-4 w-4" aria-hidden="true" />Caption
        </Button>
      </div>
      {error && <InlineError message={error} actionLabel="Dismiss" onAction={() => setError(null)} />}
    </section>
  );
}
