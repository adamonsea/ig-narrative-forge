import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MultiTenantArticle } from "./useMultiTenantTopicPipeline";

export const useMultiTenantActions = () => {
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const [deletingArticles, setDeletingArticles] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  /**
   * Approve a multi-tenant article for content generation
   */
  const approveMultiTenantArticle = async (
    article: MultiTenantArticle,
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive' = 'tabloid',
    tone: 'formal' | 'conversational' | 'engaging' = 'conversational',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    if (processingArticle) return;

    setProcessingArticle(article.id);
    console.log('🎯 Approving multi-tenant article:', {
      articleId: article.id,
      sharedContentId: article.shared_content_id,
      slideType,
      tone,
      writingStyle
    });

    try {
      // Use the new queue function for multi-tenant articles
      const { data: queueId, error: queueError } = await supabase.rpc(
        'queue_multi_tenant_article',
        {
          p_topic_article_id: article.id,
          p_shared_content_id: article.shared_content_id,
          p_slidetype: slideType,
          p_tone: tone,
          p_writing_style: writingStyle,
          p_ai_provider: 'deepseek'
        }
      );

      if (queueError) {
        console.error('Error queuing multi-tenant article:', queueError);
        throw new Error(`Failed to queue article: ${queueError.message}`);
      }

      console.log('✅ Multi-tenant article queued successfully with ID:', queueId);

      toast({
        title: "Article Approved",
        description: `"${article.title}" has been queued for content generation.`,
      });

      return queueId;
    } catch (error: any) {
      console.error('Error approving multi-tenant article:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve article. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setProcessingArticle(null);
    }
  };

  /**
   * Delete/discard a multi-tenant article
   */
  const deleteMultiTenantArticle = async (articleId: string, articleTitle: string) => {
    if (deletingArticles.has(articleId)) return;

    const newDeletingSet = new Set(deletingArticles);
    newDeletingSet.add(articleId);
    setDeletingArticles(newDeletingSet);

    try {
      console.log('🗑️ Deleting multi-tenant article:', articleId);

      // Update the multi-tenant article status to discarded instead of actually deleting
      const { error: updateError } = await supabase
        .from('topic_articles')
        .update({
          processing_status: 'discarded',
          updated_at: new Date().toISOString()
        })
        .eq('id', articleId);

      if (updateError) {
        console.error('Error discarding multi-tenant article:', updateError);
        throw new Error(`Failed to discard article: ${updateError.message}`);
      }

      console.log('✅ Multi-tenant article discarded successfully');

      toast({
        title: "Article Discarded",
        description: `"${articleTitle}" has been discarded.`,
      });

    } catch (error: any) {
      console.error('Error deleting multi-tenant article:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to discard article. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      const newDeletingSet = new Set(deletingArticles);
      newDeletingSet.delete(articleId);
      setDeletingArticles(newDeletingSet);
    }
  };

  /**
   * Delete multiple multi-tenant articles
   */
  const deleteMultipleMultiTenantArticles = async (articleIds: string[]) => {
    try {
      console.log('🗑️ Bulk deleting multi-tenant articles:', articleIds);

      // Mark all articles as being deleted
      const newDeletingSet = new Set(deletingArticles);
      articleIds.forEach(id => newDeletingSet.add(id));
      setDeletingArticles(newDeletingSet);

      // Update all articles to discarded status
      const { error: updateError } = await supabase
        .from('topic_articles')
        .update({
          processing_status: 'discarded',
          updated_at: new Date().toISOString()
        })
        .in('id', articleIds);

      if (updateError) {
        console.error('Error bulk discarding multi-tenant articles:', updateError);
        throw new Error(`Failed to discard articles: ${updateError.message}`);
      }

      console.log('✅ Multi-tenant articles bulk discarded successfully');

      toast({
        title: "Articles Discarded",
        description: `${articleIds.length} articles have been discarded.`,
      });

    } catch (error: any) {
      console.error('Error bulk deleting multi-tenant articles:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to discard articles. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      // Remove all articles from deleting set
      const newDeletingSet = new Set(deletingArticles);
      articleIds.forEach(id => newDeletingSet.delete(id));
      setDeletingArticles(newDeletingSet);
    }
  };

  /**
   * Cancel a multi-tenant queue item
   */
  const cancelMultiTenantQueueItem = async (queueId: string) => {
    try {
      console.log('⏹️ Cancelling multi-tenant queue item:', queueId);

      // Delete the queue item
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', queueId);

      if (deleteError) {
        console.error('Error cancelling multi-tenant queue item:', deleteError);
        throw new Error(`Failed to cancel queue item: ${deleteError.message}`);
      }

      // Reset the topic article status back to 'new'
      const { error: resetError } = await supabase
        .from('topic_articles')
        .update({
          processing_status: 'new',
          updated_at: new Date().toISOString()
        })
        .eq('id', queueId); // This might need adjustment based on queue item structure

      if (resetError) {
        console.warn('Warning: Failed to reset article status:', resetError);
      }

      console.log('✅ Multi-tenant queue item cancelled successfully');

      toast({
        title: "Queue Item Cancelled",
        description: "The generation task has been cancelled.",
      });

    } catch (error: any) {
      console.error('Error cancelling multi-tenant queue item:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel queue item. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  /**
   * Approve a multi-tenant story
   */
  const approveMultiTenantStory = async (storyId: string) => {
    try {
      console.log('✅ Approving multi-tenant story:', storyId);

      // Update story status to ready
      const { error: updateError } = await supabase
        .from('stories')
        .update({
          status: 'ready',
          is_published: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (updateError) {
        console.error('Error approving multi-tenant story:', updateError);
        throw new Error(`Failed to approve story: ${updateError.message}`);
      }

      console.log('✅ Multi-tenant story approved successfully');

      toast({
        title: "Story Approved",
        description: "The story has been approved and is now ready for publishing.",
      });

    } catch (error: any) {
      console.error('Error approving multi-tenant story:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to approve story. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  /**
   * Reject/delete a multi-tenant story
   */
  const rejectMultiTenantStory = async (storyId: string) => {
    try {
      console.log('❌ Rejecting multi-tenant story:', storyId);

      // Get the story to find associated article
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select('topic_article_id, shared_content_id')
        .eq('id', storyId)
        .single();

      if (storyError) {
        console.error('Error fetching story:', storyError);
        throw new Error(`Failed to fetch story: ${storyError.message}`);
      }

      // Delete the story using the existing cascade function
      const { data: deleteResult, error: deleteError } = await supabase.rpc(
        'delete_story_cascade',
        { p_story_id: storyId }
      );

      if (deleteError || !(deleteResult as any)?.success) {
        console.error('Error deleting story:', deleteError);
        throw new Error(`Failed to delete story: ${deleteError?.message || 'Unknown error'}`);
      }

      // Reset associated multi-tenant article status to 'new' if it exists
      if (story?.topic_article_id) {
        const { error: resetError } = await supabase
          .from('topic_articles')
          .update({
            processing_status: 'new',
            updated_at: new Date().toISOString()
          })
          .eq('id', story.topic_article_id);

        if (resetError) {
          console.warn('Warning: Failed to reset multi-tenant article status:', resetError);
        }
      }

      console.log('✅ Multi-tenant story rejected and deleted successfully');

      toast({
        title: "Story Rejected",
        description: "The story has been rejected and removed.",
      });

    } catch (error: any) {
      console.error('Error rejecting multi-tenant story:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to reject story. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    processingArticle,
    deletingArticles,
    approveMultiTenantArticle,
    deleteMultiTenantArticle,
    deleteMultipleMultiTenantArticles,
    cancelMultiTenantQueueItem,
    approveMultiTenantStory,
    rejectMultiTenantStory,
  };
};