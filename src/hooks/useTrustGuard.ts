import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { trustVerdict, type TrustVerdict } from "@/lib/sourceTrust";

/** Returns a checker for whether a source may use "Trust everything" on this feed. */
export function useTrustGuard(topicId: string | null | undefined) {
  const { data } = useQuery({
    queryKey: ["trust-guard-terms", topicId],
    enabled: Boolean(topicId),
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("topics").select("name, keywords, topic_type").eq("id", topicId!).maybeSingle();
      const terms = [data?.name ?? "", ...((data?.keywords as string[] | null) ?? [])].filter(Boolean);
      return { terms, regional: data?.topic_type === "regional" };
    },
  });
  return (source: { url: string; name?: string }): TrustVerdict =>
    data ? trustVerdict(source, data.terms, data.regional) : "allowed";
}
