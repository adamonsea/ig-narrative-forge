import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Trash2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

interface CleanupButtonProps {
  topicId: string;
  onCleanupComplete: () => void;
}

export const CleanupButton: React.FC<CleanupButtonProps> = ({ topicId, onCleanupComplete }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const handleCleanup = async () => {
    if (!topicId) return;
    
    setIsLoading(true);
    try {
      // Find articles that have been processed (have stories)
      const { data: processedArticles, error } = await supabase
        .from('topic_articles')
        .select(`
          id,
          shared_content_id,
          shared_article_content!inner(title)
        `)
        .eq('topic_id', topicId)
        .eq('processing_status', 'processed')
        .limit(100);

      if (error) throw error;

      if (!processedArticles || processedArticles.length === 0) {
        toast({
          title: "Nothing to Clean",
          description: "No processed articles found in Arrivals",
        });
        return;
      }

      // Mark these articles as discarded
      const { error: updateError } = await supabase
        .from('topic_articles')
        .update({ 
          processing_status: 'discarded',
          updated_at: new Date().toISOString()
        })
        .in('id', processedArticles.map(a => a.id));

      if (updateError) throw updateError;

      toast({
        title: "Cleanup Complete",
        description: `Removed ${processedArticles.length} processed articles from Arrivals`,
      });

      onCleanupComplete();

    } catch (error: any) {
      console.error('Error cleaning up:', error);
      toast({
        title: "Cleanup Failed",
        description: error.message || "Failed to cleanup processed articles",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button 
          variant="outline" 
          size="sm"
          className="text-orange-600 hover:text-orange-700 border-orange-200 hover:border-orange-300"
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Trash2 className="w-4 h-4 mr-2" />
          )}
          Cleanup Published
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clean Up Processed Articles</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove articles from Arrivals that have already been processed and published. 
            This helps keep your Arrivals queue focused on new content that needs review.
            <br /><br />
            <strong>This action cannot be undone.</strong>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleCleanup}
            className="bg-orange-600 hover:bg-orange-700"
          >
            Clean Up
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};