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

  const discardAndSuppress = async (articleId: string, topicId: string, articleUrl: string, articleTitle: string) => {
    try {
      // First discard the article
      const discardResult = await markArticleAsDiscarded(articleId);
      if (!discardResult.success) {
        return { success: false, error: discardResult.error };
      }

      // Then add to suppression list
      const { error: suppressError } = await supabase
        .from('discarded_articles')
        .insert({
          topic_id: topicId,
          normalized_url: articleUrl.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, ''),
          url: articleUrl,
          title: articleTitle,
          discarded_by: (await supabase.auth.getUser()).data.user?.id,
          discarded_reason: 'user_suppress'
        });

      if (suppressError) {
        console.error('Error adding to suppression list:', suppressError);
        toast({
          title: "Partial Success", 
          description: "Article discarded but suppression failed. It may reappear in future scrapes.",
          variant: "destructive",
        });
        return { success: false, error: suppressError };
      }

      toast({
        title: "Article Suppressed",
        description: "Article discarded and permanently suppressed from future scrapes.",
      });

      return { success: true };
    } catch (error) {
      console.error('Error in discard and suppress:', error);
      toast({
        title: "Error",
        description: "Failed to suppress article.",
        variant: "destructive",
      });
      return { success: false, error };
    }
  };

  return {
    markArticleAsDiscarded,
    discardAndSuppress
  };
};