import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { FRAME_ASPECT, isFramedCover, readFraming } from "@/lib/pictureFrame";
import { PictureEditor } from "./PictureEditor";
import { fetchStorySource, saveStoryPicture } from "./savePicture";

interface StoryPictureRow {
  cover_illustration_url: string | null;
  cover_original_url: string | null;
  cover_framing: unknown;
  animated_illustration_url: string | null;
}

/** Edit picture for one story, framed in the feed's own cover shape (split or full bleed). */
export function StoryPictureEditor({ storyId, topicId, onDone, onCancel }: { storyId: string; topicId: string; onDone: () => void; onCancel: () => void }) {
  const { data: row, isLoading } = useQuery({
    queryKey: ["story-picture", storyId],
    staleTime: 0,
    queryFn: async () => {
      const { data, error } = await supabase.from("stories")
        .select("cover_illustration_url, cover_original_url, cover_framing, animated_illustration_url" as never)
        .eq("id", storyId).maybeSingle();
      if (error) throw error;
      return (data ?? null) as StoryPictureRow | null;
    },
  });
  const { data: coverStyle } = useQuery({
    queryKey: ["topic-cover-style", topicId],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("topics").select("story_cover_style" as never).eq("id", topicId).maybeSingle();
      return ((data as { story_cover_style?: string } | null)?.story_cover_style ?? "split") as string;
    },
  });

  if (isLoading || !coverStyle) return <div className="aspect-[3/2] w-full animate-pulse rounded-lg bg-muted" aria-hidden="true" />;

  const cover = row?.cover_illustration_url ?? null;
  const framed = isFramedCover(cover) && Boolean(row?.cover_original_url);
  const original = framed ? row!.cover_original_url : cover;
  const aspect = coverStyle === "full-bleed" ? FRAME_ASPECT.storyFullBleed : FRAME_ASPECT.storySplit;

  return (
    <PictureEditor
      aspect={aspect}
      initialFraming={framed ? readFraming(row?.cover_framing) : null}
      loadSource={async () => (original ? fetchStorySource(storyId, original) : null)}
      note={row?.animated_illustration_url ? "The moving picture will be removed." : null}
      onCancel={onCancel}
      onSave={async (img, framing, replaced) => {
        await saveStoryPicture({
          storyId, topicId, img, framing, aspect, replaced,
          currentCover: cover,
          originalUrl: replaced ? null : original,
          previousOriginal: row?.cover_original_url ?? null,
          hasAnimation: Boolean(row?.animated_illustration_url),
        });
        onDone();
      }}
    />
  );
}
