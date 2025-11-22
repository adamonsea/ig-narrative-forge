import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Topic {
  id: string;
  name: string;
  slug: string;
  region: string | null;
  topic_type: string;
  is_active: boolean;
}

export function useTopics() {
  return useQuery({
    queryKey: ["topics"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        throw new Error("User not authenticated");
      }

      const { data, error } = await supabase
        .from("topics")
        .select("id, name, slug, region, topic_type, is_active")
        .eq("is_active", true)
        .eq("is_archived", false)
        .eq("created_by", user.id)
        .order("name");

      if (error) throw error;
      return data as Topic[];
    },
  });
}
