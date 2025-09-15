import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MultiTenantArticle } from "./useMultiTenantTopicPipeline";

export const useMultiTenantActions = () => {
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const [deletingArticles, setDeletingArticles] = useState<Set<string>>(new Set());
  // Animation states for immediate feedback (matching legacy system)
  const [animatingArticles, setAnimatingArticles] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  /**
   * Approve a multi-tenant article for content generation (following legacy pattern)
   */
  const approveMultiTenantArticle = async (
    article: MultiTenantArticle,
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive' = 'tabloid',
    tone: 'formal' | 'conversational' | 'engaging' = 'conversational',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    if (processingArticle) return;

    // Immediate animation feedback - trigger slide-out-right (matching legacy)
    setAnimatingArticles(prev => new Set([...prev, article.id]));
    setProcessingArticle(article.id);

    try {
      console.log('🎯 Approving multi-tenant article:', {
        articleId: article.id,
        sharedContentId: article.shared_content_id,
        slideType,
        tone,
        writingStyle
      });

      // Check for existing queue entries (following legacy pattern)
      const { data: existingQueueEntries, error: checkError } = await supabase
        .from('content_generation_queue')
        .select('id, status')
        .eq('shared_content_id', article.shared_content_id)
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
        return activeEntry.id;
      }

      // Update multi-tenant article status to processed (equivalent to legacy)
      const { error: updateError } = await supabase
        .from('topic_articles')
        .update({ 
          processing_status: 'processed',
          updated_at: new Date().toISOString()
        })
        .eq('id', article.id);

      if (updateError) throw new Error(`Failed to update article status: ${updateError.message}`);

      // Create or find bridge article in legacy table for foreign key constraint
      let bridgeArticleId: string;
      
      // First, try to find existing bridge article for this shared content
      const { data: existingBridge, error: bridgeCheckError } = await supabase
        .from('articles')
        .select('id')
        .eq('source_url', article.url)
        .limit(1)
        .single();

      if (existingBridge && !bridgeCheckError) {
        bridgeArticleId = existingBridge.id;
        console.log('🔗 Using existing bridge article:', bridgeArticleId);
        
        // Update the existing article to processed status
        await supabase
          .from('articles')
          .update({ processing_status: 'processed' })
          .eq('id', bridgeArticleId);
      } else {
        // Create bridge article with conflict handling
        const { data: bridgeData, error: bridgeError } = await supabase
          .from('articles')
          .upsert({
            title: article.title,
            body: article.body || 'Multi-tenant bridge article',
            source_url: article.url,
            canonical_url: article.url,
            author: article.author,
            published_at: article.published_at,
            processing_status: 'processed',
            content_quality_score: article.content_quality_score,
            regional_relevance_score: article.regional_relevance_score,
            word_count: article.word_count,
            import_metadata: {
              multi_tenant_bridge: true,
              topic_article_id: article.id,
              shared_content_id: article.shared_content_id,
              created_for_queue: true
            }
          }, {
            onConflict: 'source_url',
            ignoreDuplicates: false
          })
          .select('id')
          .single();

        if (bridgeError) {
          // If still a constraint error, try to find the existing article
          if (bridgeError.code === '23505') {
            const { data: fallbackBridge } = await supabase
              .from('articles')
              .select('id')
              .eq('source_url', article.url)
              .limit(1)
              .single();
            
            if (fallbackBridge) {
              bridgeArticleId = fallbackBridge.id;
              console.log('🔗 Using fallback bridge article:', bridgeArticleId);
            } else {
              throw new Error(`Failed to resolve bridge article conflict: ${bridgeError.message}`);
            }
          } else {
            throw new Error(`Failed to create bridge article: ${bridgeError.message}`);
          }
        } else {
          bridgeArticleId = bridgeData.id;
          console.log('🔗 Created/updated bridge article:', bridgeArticleId);
        }
      }

      // Insert into generation queue using bridge article
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: bridgeArticleId, // Use bridge article for foreign key constraint
          topic_article_id: article.id,
          shared_content_id: article.shared_content_id,
          slidetype: slideType,
          ai_provider: 'deepseek',
          tone: tone,
          writing_style: writingStyle,
          audience_expertise: 'intermediate',
          status: 'pending'
        })
        .select('id')
        .single();

      if (queueError) {
        // Check for duplicate key constraint violation
        if (queueError.code === '23505') {
          toast({
            title: "Article Queued",
            description: "This article is already being processed. Please wait for the current job to complete.",
            variant: "default"
          });
          return null;
        }
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

      console.log('✅ Multi-tenant article queued successfully with ID:', queueData.id);
      return queueData.id;

    } catch (error: any) {
      console.error('Error approving multi-tenant article:', error);
      
      // Reverse animation on error
      setAnimatingArticles(prev => {
        const newSet = new Set(prev);
        newSet.delete(article.id);
        return newSet;
      });
      
      toast({
        title: "Approval Failed",
        description: error.message || "Failed to approve article. Please try again.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setProcessingArticle(null);
      // Clean up animation state
      setTimeout(() => {
        setAnimatingArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(article.id);
          return newSet;
        });
      }, 300);
    }
  };

  /**
   * Delete/discard a multi-tenant article (following legacy pattern)
   * Now with permanent auto-suppression via database trigger
   */
  const deleteMultiTenantArticle = async (articleId: string, articleTitle: string) => {
    if (deletingArticles.has(articleId)) return;

    // Immediate animation feedback - trigger discard animation (matching legacy)
    setAnimatingArticles(prev => new Set([...prev, articleId]));
    setDeletingArticles(prev => new Set([...prev, articleId]));

    try {
      console.log('🗑️ Deleting multi-tenant article (with auto-suppression):', articleId);

      // Update the multi-tenant article status to discarded 
      // Auto-suppression handled by database trigger
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

      console.log('✅ Multi-tenant article permanently deleted with auto-suppression');

      toast({
        title: "Article Permanently Deleted",
        description: `"${articleTitle}" will never reappear in future scrapes.`,
      });

      // Clean up animation state after delay (matching legacy)
      setTimeout(() => {
        setAnimatingArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(articleId);
          return newSet;
        });
        setDeletingArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(articleId);
          return newSet;
        });
      }, 300);

    } catch (error: any) {
      console.error('Error deleting multi-tenant article:', error);
      
      // Reverse animation on error
      setAnimatingArticles(prev => {
        const newSet = new Set(prev);
        newSet.delete(articleId);
        return newSet;
      });
      setDeletingArticles(prev => {
        const newSet = new Set(prev);
        newSet.delete(articleId);
        return newSet;
      });
      
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to discard article. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  /**
   * Delete multiple multi-tenant articles (following legacy pattern)
   */
  const deleteMultipleMultiTenantArticles = async (articleIds: string[]) => {
    try {
      console.log('🗑️ Bulk deleting multi-tenant articles:', articleIds);

      // Set all articles as being deleted with animation (matching legacy)
      articleIds.forEach(id => {
        setDeletingArticles(prev => new Set([...prev, id]));
        setAnimatingArticles(prev => new Set([...prev, id]));
      });

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
        title: "Articles Permanently Deleted",
        description: `${articleIds.length} articles will never reappear in future scrapes.`,
      });

      // Clean up animation states after delay (matching legacy)
      setTimeout(() => {
        articleIds.forEach(id => {
          setAnimatingArticles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
          setDeletingArticles(prev => {
            const newSet = new Set(prev);
            newSet.delete(id);
            return newSet;
          });
        });
      }, 300);

    } catch (error: any) {
      console.error('Error bulk deleting multi-tenant articles:', error);
      
      // Reverse animations on error
      articleIds.forEach(id => {
        setAnimatingArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
        setDeletingArticles(prev => {
          const newSet = new Set(prev);
          newSet.delete(id);
          return newSet;
        });
      });
      
      toast({
        title: "Deletion Failed",
        description: error.message || "Failed to discard articles. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  /**
   * Cancel a multi-tenant queue item (following legacy pattern)
   */
  const cancelMultiTenantQueueItem = async (queueId: string) => {
    try {
      console.log('⏹️ Cancelling multi-tenant queue item:', queueId);

      // Get the queue item to find the topic_article_id
      const { data: queueItem, error: fetchError } = await supabase
        .from('content_generation_queue')
        .select('topic_article_id')
        .eq('id', queueId)
        .single();

      if (fetchError) {
        console.error('Error fetching queue item:', fetchError);
        throw new Error(`Failed to fetch queue item: ${fetchError.message}`);
      }

      // Delete the queue item (matching legacy)
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', queueId);

      if (deleteError) {
        console.error('Error cancelling multi-tenant queue item:', deleteError);
        throw new Error(`Failed to cancel queue item: ${deleteError.message}`);
      }

      // Reset the topic article status back to 'new'
      if (queueItem?.topic_article_id) {
        const { error: resetError } = await supabase
          .from('topic_articles')
          .update({
            processing_status: 'new',
            updated_at: new Date().toISOString()
          })
          .eq('id', queueItem.topic_article_id);

        if (resetError) {
          console.warn('Warning: Failed to reset article status:', resetError);
        }
      }

      console.log('✅ Multi-tenant queue item cancelled successfully');

      toast({
        title: "Job Cancelled",
        description: "Processing job has been cancelled",
      });

    } catch (error: any) {
      console.error('Error cancelling multi-tenant queue item:', error);
      toast({
        title: "Cancellation Failed",
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

  /**
   * Return a published story back to review (draft status)
   */
  const returnToReview = async (storyId: string) => {
    try {
      console.log('🔄 Returning story to review:', storyId);

      // Get the story to find associated article
      const { data: story, error: storyError } = await supabase
        .from('stories')
        .select('topic_article_id, shared_content_id, title')
        .eq('id', storyId)
        .single();

      if (storyError) {
        console.error('Error fetching story:', storyError);
        throw new Error(`Failed to fetch story: ${storyError.message}`);
      }

      // Update story status back to draft
      const { error: storyUpdateError } = await supabase
        .from('stories')
        .update({
          status: 'draft',
          is_published: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', storyId);

      if (storyUpdateError) {
        console.error('Error updating story status:', storyUpdateError);
        throw new Error(`Failed to update story status: ${storyUpdateError.message}`);
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

      console.log('✅ Story returned to review successfully');

      toast({
        title: "Story Returned to Review",
        description: `"${story?.title}" has been sent back to arrivals for review.`,
      });

    } catch (error: any) {
      console.error('Error returning story to review:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to return story to review. Please try again.",
        variant: "destructive",
      });
      throw error;
    }
  };

  return {
    // State variables (matching legacy system)
    processingArticle,
    deletingArticles,
    animatingArticles, // New animation state
    
    // Action functions
    approveMultiTenantArticle,
    deleteMultiTenantArticle,
    deleteMultipleMultiTenantArticles,
    cancelMultiTenantQueueItem,
    approveMultiTenantStory,
    rejectMultiTenantStory,
    returnToReview,
  };
};