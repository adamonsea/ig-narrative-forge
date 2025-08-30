import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export const useArticleActions = () => {
  const { toast } = useToast();

  const markArticleAsDiscarded = async (articleId: string) => {
    try {
      const { error } = await supabase.functions.invoke('mark-article-discarded', {
        body: { articleId }
      });

      if (error) {
        throw error;
      }

      toast({
        title: "Article Discarded",
        description: "Article has been marked as discarded and won't appear in future scrapes.",
      });

      return { success: true };
    } catch (error) {
      console.error('Error marking article as discarded:', error);
      toast({
        title: "Error",
        description: "Failed to mark article as discarded.",
        variant: "destructive",
      });
      return { success: false, error };
    }
  };

  return {
    markArticleAsDiscarded
  };
};