import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Credit text saved for a story's publisher-photo cover. Only queried when the cover is a publisher photo. */
export function usePhotoCredit(storyId: string | undefined, enabled: boolean) {
  const { data } = useQuery({
    queryKey: ["story-photo-credit", storyId],
    enabled: enabled && !!storyId,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase
        .from("stories")
        .select("cover_photo_credit" as any)
        .eq("id", storyId!)
        .maybeSingle();
      return ((data as any)?.cover_photo_credit as string | null) ?? null;
    },
  });
  return data ?? null;
}
