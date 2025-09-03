import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';

interface DeleteStoryResponse {
  success: boolean;
  error?: string;
  story_id?: string;
  article_reset?: boolean;
  deleted_counts?: {
    slides: number;
    visuals: number;
    posts: number;
    exports: number;
  };
}

export const useTopicPipelineActions = (onRefresh: () => void) => {
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [deletingQueueItems, setDeletingQueueItems] = useState<Set<string>>(new Set());
  const [deletingArticles, setDeletingArticles] = useState<Set<string>>(new Set());
  
  // Animation states for immediate feedback
  const [animatingArticles, setAnimatingArticles] = useState<Set<string>>(new Set());
  const [animatingStories, setAnimatingStories] = useState<Set<string>>(new Set());
  
  const { toast } = useToast();
  const { user } = useAuth();

  const approveArticle = async (
    articleId: string, 
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive' = 'tabloid', 
    tone: 'formal' | 'conversational' | 'engaging' = 'conversational',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    // Immediate animation feedback - trigger slide-out-right
    setAnimatingArticles(prev => new Set([...prev, articleId]));
    setProcessingArticle(articleId);

    try {
      
      // Check if article already has a completed story
      const { data: existingStory, error: storyCheckError } = await supabase
        .from('stories')
        .select('id, status, title')
        .eq('article_id', articleId)
        .in('status', ['ready', 'draft'])
        .maybeSingle();

      if (storyCheckError) {
        throw new Error(`Failed to check for existing story: ${storyCheckError.message}`);
      }

      if (existingStory) {
        toast({
          title: "Story Already Exists",
          description: `This article already has a ${existingStory.status} story. Check the "Ready Stories" tab to view it.`,
          variant: "destructive"
        });
        return;
      }
      
      // Check for existing queue entries
      const { data: existingQueueEntries, error: checkError } = await supabase
        .from('content_generation_queue')
        .select('id, status')
        .eq('article_id', articleId)
        .order('created_at', { ascending: false });

      if (checkError) {
        throw new Error(`Failed to check queue: ${checkError.message}`);
      }

      const activeEntry = existingQueueEntries?.find(entry => ['pending', 'processing'].includes(entry.status));
      if (activeEntry) {
        toast({
          title: "Article Queued",
          description: "This article is already being processed - check the queue for progress",
          variant: "default"
        });
        return;
      }

      // Update article status to processed
      const { error: updateError } = await supabase
        .from('articles')
        .update({ processing_status: 'processed' })
        .eq('id', articleId);

      if (updateError) throw new Error(`Failed to update article status: ${updateError.message}`);

      // Get article and topic info for audience expertise
      const { data: articleData, error: articleError } = await supabase
        .from('articles')
        .select(`
          id,
          topic_id,
          topics!inner(audience_expertise, default_tone)
        `)
        .eq('id', articleId)
        .single();

      if (articleError) throw new Error(`Failed to get article data: ${articleError.message}`);

      const audienceExpertise = articleData.topics?.audience_expertise || 'intermediate';

      // Add to generation queue
      const { error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: articleId,
          slidetype: slideType,
          ai_provider: 'deepseek',
          tone: tone,
          writing_style: writingStyle,
          audience_expertise: audienceExpertise,
          status: 'pending'
        });

      if (queueError) {
        // Check for duplicate key constraint violation
        if (queueError.code === '23505' && queueError.message.includes('idx_content_queue_unique_article_pending')) {
          toast({
            title: "Article Queued",
            description: "This article is already being processed. Please wait for the current job to complete.",
            variant: "default"
          });
          return;
        }
        
        // Log the error to the new error tracking system
        await supabase.rpc('log_error_ticket', {
          p_ticket_type: 'generation',
          p_source_info: { article_id: articleId, slide_type: slideType },
          p_error_details: `Failed to queue generation job: ${queueError.message}`,
          p_error_code: queueError.code,
          p_context_data: { function: 'approveArticle', user_id: user?.id },
          p_severity: 'high'
        });
        
        throw new Error(`Failed to queue job: ${queueError.message}`);
      }

      const typeLabels = {
        short: 'Short Carousel (4 slides)',
        tabloid: 'Tabloid Style (6 slides)', 
        indepth: 'In-Depth Analysis (8 slides)',
        extensive: 'Comprehensive Story (12 slides)'
      };

      toast({
        title: "Article Approved",
        description: `${typeLabels[slideType]} generation started using DeepSeek`
      });
      
      // Delay refresh to allow animation to complete
      setTimeout(() => {
        setAnimatingArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(articleId);
          return newSet;
        });
        onRefresh();
      }, 300);

    } catch (error) {
      console.error('Error approving article:', error);
      
      // Reverse animation on error
      setAnimatingArticles(prev => {
        const newSet = new Set(prev);
        newSet.delete(articleId);
        return newSet;
      });
      
      toast({
        title: "Approval Failed",
        description: error instanceof Error ? error.message : "Unknown error occurred",
        variant: "destructive"
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const approveStory = async (storyId: string) => {
    try {
      setProcessingApproval(prev => new Set([...prev, storyId]));

      const { error: storyError } = await supabase
        .from('stories')
        .update({ 
          status: 'ready',
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (storyError) throw storyError;

      // Generate carousel images
      toast({
        title: "Story Approved",
        description: "Story approved - generating carousel images..."
      });

      const { error: carouselError } = await supabase.functions.invoke('generate-carousel-images', {
        body: { storyId }
      });

      if (carouselError) {
        console.warn('Carousel generation failed:', carouselError);
        toast({
          title: "Carousel Generation Failed", 
          description: "Story approved but carousel generation failed. You can retry later.",
          variant: "destructive"
        });
      } else {
        toast({
          title: "Success!",
          description: "Story approved and carousel images generated successfully"
        });
      }

      onRefresh();
    } catch (error) {
      console.error('Error approving story:', error);
      toast({
        title: "Approval Failed",
        description: "Failed to approve story",
        variant: "destructive"
      });
    } finally {
      setProcessingApproval(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
    }
  };

  const rejectStory = async (storyId: string) => {
    try {
      setProcessingRejection(prev => new Set([...prev, storyId]));

      // First get the article_id from the story
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select('article_id')
        .eq('id', storyId)
        .single();

      if (storyError) throw new Error(`Failed to get story details: ${storyError.message}`);

      // Mark the article as discarded using the article_id
      const { error } = await supabase.functions.invoke('mark-article-discarded', {
        body: { articleId: story.article_id }
      });

      if (error) throw error;

      toast({
        title: "Story Rejected",
        description: "Story has been rejected and article marked as discarded"
      });

      onRefresh();
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({
        title: "Rejection Failed",
        description: "Failed to reject story",
        variant: "destructive"
      });
    } finally {
      setProcessingRejection(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
    }
  };

  const returnToReview = async (storyId: string) => {
    // Immediate animation feedback - trigger slide-out-left
    setAnimatingStories(prev => new Set([...prev, storyId]));

    try {
      // First get the article_id from the story
      const { data: story, error: storyFetchError } = await supabase
        .from('stories')
        .select('article_id')
        .eq('id', storyId)
        .single();

      if (storyFetchError) throw new Error(`Failed to get story details: ${storyFetchError.message}`);

      // Update both story status to draft and article status back to new
      const [storyUpdate, articleUpdate] = await Promise.all([
        supabase
          .from('stories')
          .update({ 
            status: 'draft',
            updated_at: new Date().toISOString()
          })
          .eq('id', storyId),
        supabase
          .from('articles')
          .update({ 
            processing_status: 'new',
            updated_at: new Date().toISOString()
          })
          .eq('id', story.article_id)
      ]);

      if (storyUpdate.error) throw new Error(`Failed to update story: ${storyUpdate.error.message}`);
      if (articleUpdate.error) throw new Error(`Failed to update article: ${articleUpdate.error.message}`);

      toast({
        title: "Returned to Review",
        description: "Story has been returned to draft status and will appear in pending articles"
      });

      // Delay refresh to allow animation to complete
      setTimeout(() => {
        setAnimatingStories(prev => {
          const newSet = new Set(prev);
          newSet.delete(storyId);
          return newSet;
        });
        onRefresh();
      }, 300);
    } catch (error) {
      console.error('Error returning story to review:', error);
      
      // Reverse animation on error
      setAnimatingStories(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
      
      toast({
        title: "Return Failed",
        description: error instanceof Error ? error.message : "Failed to return story to review",
        variant: "destructive"
      });
    }
  };

  const deleteStory = async (storyId: string, storyTitle: string) => {
    try {
      setDeletingStories(prev => new Set([...prev, storyId]));

      const { data, error } = await supabase.rpc('delete_story_cascade', {
        p_story_id: storyId
      });

      if (error) throw error;

      const result = data as unknown as DeleteStoryResponse;
      if (result?.success) {
        toast({
          title: "Story Deleted",
          description: `"${storyTitle}" and all related content have been deleted`
        });
        onRefresh();
      } else {
        throw new Error(result?.error || 'Unknown deletion error');
      }
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete story",
        variant: "destructive"
      });
    } finally {
      setDeletingStories(prev => {
        const newSet = new Set(prev);
        newSet.delete(storyId);
        return newSet;
      });
    }
  };

  const cancelQueueItem = async (queueId: string) => {
    try {
      setDeletingQueueItems(prev => new Set([...prev, queueId]));

      const { error } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', queueId);

      if (error) throw error;

      toast({
        title: "Job Cancelled",
        description: "Processing job has been cancelled"
      });

      onRefresh();
    } catch (error) {
      console.error('Error cancelling job:', error);
      toast({
        title: "Cancellation Failed",
        description: "Failed to cancel processing job",
        variant: "destructive"
      });
    } finally {
      setDeletingQueueItems(prev => {
        const newSet = new Set(prev);
        newSet.delete(queueId);
        return newSet;
      });
    }
  };

  const deleteArticle = async (articleId: string, articleTitle: string) => {
    try {
      setDeletingArticles(prev => new Set([...prev, articleId]));

      // Set article status to discarded to prevent re-importing
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: "Article Deleted",
        description: `"${articleTitle}" has been discarded and won't be re-imported`
      });

      onRefresh();
    } catch (error) {
      console.error('Error deleting article:', error);
      toast({
        title: "Deletion Failed",
        description: "Failed to delete article",
        variant: "destructive"
      });
    } finally {
      setDeletingArticles(prev => {
        const newSet = new Set(prev);
        newSet.delete(articleId);
        return newSet;
      });
    }
  };

  return {
    processingArticle,
    processingApproval,
    processingRejection,
    deletingStories,
    deletingQueueItems,
    deletingArticles,
    animatingArticles,
    animatingStories,
    approveArticle,
    approveStory,
    rejectStory,
    returnToReview,
    deleteStory,
    cancelQueueItem,
    deleteArticle
  };
};