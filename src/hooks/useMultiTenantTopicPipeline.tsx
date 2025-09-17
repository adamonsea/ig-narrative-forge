import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";

// Multi-tenant article interface
export interface MultiTenantArticle {
  id: string;
  shared_content_id: string;
  title: string;
  body?: string;
  author?: string;
  url: string;
  image_url?: string;
  published_at?: string;
  word_count: number;
  processing_status: string;
  regional_relevance_score: number;
  content_quality_score: number;
  keyword_matches?: string[];
  created_at: string;
  updated_at: string;
  is_snippet: boolean; // Flag for articles under 150 words
}

export interface MultiTenantQueueItem {
  id: string;
  topic_article_id: string;
  shared_content_id: string;
  title: string;
  article_title: string;
  article_url: string;
  status: string;
  created_at: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  slidetype?: string;
  tone?: string;
  writing_style?: string;
}

export interface MultiTenantStory {
  id: string;
  topic_article_id: string;
  shared_content_id: string;
  title: string;
  status: string;
  created_at: string;
  updated_at: string;
  url?: string;
  author?: string;
  word_count?: number;
  cover_illustration_url?: string;
  illustration_generated_at?: string;
  slidetype?: string;
  tone?: string;
  writing_style?: string;
  audience_expertise?: string;
  slides?: any[];
  is_teaser?: boolean; // Flag for stories generated from snippets
}

export interface MultiTenantStats {
  totalArticles: number;
  pendingArticles: number;
  processingQueue: number;
  readyStories: number;
}

export const useMultiTenantTopicPipeline = (selectedTopicId: string | null) => {
  const { toast } = useToast();
  const [articles, setArticles] = useState<MultiTenantArticle[]>([]);
  const [queueItems, setQueueItems] = useState<MultiTenantQueueItem[]>([]);
  const [stories, setStories] = useState<MultiTenantStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MultiTenantStats>({
    totalArticles: 0,
    pendingArticles: 0,
    processingQueue: 0,
    readyStories: 0
  });

  // Import multi-tenant actions
  const {
    processingArticle,
    deletingArticles,
    animatingArticles, // New animation state
    approveMultiTenantArticle,
    deleteMultiTenantArticle,
    deleteMultipleMultiTenantArticles,
    cancelMultiTenantQueueItem,
    approveMultiTenantStory,
    rejectMultiTenantStory
  } = useMultiTenantActions();

  const loadTopicContent = useCallback(async () => {
    if (!selectedTopicId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

        // Get multi-tenant articles using the new RPC function
      const articlesResult = await supabase.rpc('get_topic_articles_multi_tenant', {
        p_topic_id: selectedTopicId,
        p_limit: 100
      });

      if (articlesResult.error) {
        console.error('Error loading multi-tenant articles:', articlesResult.error);
        toast({
          title: "Error loading articles",
          description: "Failed to load articles. Please try refreshing.",
          variant: "destructive",
        });
        setArticles([]);
      } else {
        // Get story IDs to filter out articles that are already published
        const publishedStoryIds = new Set();
        if (articlesResult.data) {
          const { data: storiesData } = await supabase
            .from('stories')
            .select('topic_article_id, shared_content_id')
            .eq('status', 'ready');
          
          storiesData?.forEach(story => {
            if (story.topic_article_id) publishedStoryIds.add(story.topic_article_id);
          });
        }

        const articlesData = articlesResult.data
          ?.filter((item: any) => 
            item.processing_status === 'new' && // Only show new articles awaiting processing
            !publishedStoryIds.has(item.id) // Filter out articles that already have published stories
          )
          ?.map((item: any) => {
            const wordCount = item.word_count || 0;
            const isSnippet = wordCount > 0 && wordCount < 150; // Flag snippets under 150 words
            
            return {
              id: item.id,
              shared_content_id: item.shared_content_id,
              title: item.title,
              body: item.body,
              author: item.author,
              url: item.url,
              image_url: item.image_url,
              published_at: item.published_at,
              word_count: wordCount,
              processing_status: item.processing_status,
              regional_relevance_score: item.regional_relevance_score || 0,
              content_quality_score: item.content_quality_score || 0,
              keyword_matches: item.keyword_matches || [],
              created_at: item.created_at,
              updated_at: item.updated_at,
              is_snippet: isSnippet
            };
          }) || [];
        setArticles(articlesData);
      }

      // Declare variables for filtered data
      let filteredQueueItems: any[] = [];
      let filteredStories: any[] = [];

      // Get queue items for articles from this topic
      const queueResult = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          topic_article_id,
          shared_content_id,
          status,
          created_at,
          attempts,
          max_attempts,
          error_message,
          slidetype,
          tone,
          writing_style,
          shared_article_content!inner(title, url)
        `)
        .not('topic_article_id', 'is', null)
        .order('created_at', { ascending: false });

      if (queueResult.error) {
        console.error('Error loading queue items:', queueResult.error);
        setQueueItems([]);
      } else {
        // Filter queue items to only include those from articles in this topic
        const topicArticleIds = new Set((articlesResult.data || []).map((a: any) => a.id));
        filteredQueueItems = (queueResult.data || []).filter((item: any) => 
          topicArticleIds.has(item.topic_article_id)
        );
        
        const queueItemsData = filteredQueueItems.map((item: any) => ({
          id: item.id,
          topic_article_id: item.topic_article_id,
          shared_content_id: item.shared_content_id,
          title: item.shared_article_content?.title || 'Unknown Title',
          article_title: item.shared_article_content?.title || 'Unknown Title',
          article_url: item.shared_article_content?.url || '',
          status: item.status,
          created_at: item.created_at,
          attempts: item.attempts || 0,
          max_attempts: item.max_attempts || 3,
          error_message: item.error_message,
          slidetype: item.slidetype,
          tone: item.tone,
          writing_style: item.writing_style
        }));
        setQueueItems(queueItemsData);
      }

      // Load published stories directly with topic-based joins for stability
      console.log('🔄 Loading published stories for topic:', selectedTopicId);
        
        // Fix: Split into two separate queries to avoid PostgREST .or() issues
        const [legacyStoriesResult, multiTenantStoriesResult] = await Promise.all([
          // Query 1: Legacy stories via articles table - REMOVED LIMIT
          supabase
            .from('stories')
            .select(`
              *,
              slides:slides(*),
              article:articles!inner(title, source_url, region, topic_id)
            `)
            .eq('status', 'ready')
            .eq('is_published', true)
            .eq('article.topic_id', selectedTopicId)
            .order('created_at', { ascending: false }),
          
          // Query 2: Multi-tenant stories via topic_articles table - REMOVED LIMIT
          supabase
            .from('stories')
            .select(`
              *,
              slides:slides(*),
              topic_article:topic_articles!inner(
                id, topic_id,
                shared_content:shared_article_content(title, url)
              )
            `)
            .eq('status', 'ready')
            .eq('is_published', true)
            .eq('topic_article.topic_id', selectedTopicId)
            .order('created_at', { ascending: false })
        ]);

        console.log('📊 Stories query results:', {
          legacy: legacyStoriesResult.data?.length || 0,
          multiTenant: multiTenantStoriesResult.data?.length || 0,
          legacyError: legacyStoriesResult.error,
          multiTenantError: multiTenantStoriesResult.error
        });

        // Merge and deduplicate results
        const allStories = [
          ...(legacyStoriesResult.data || []),
          ...(multiTenantStoriesResult.data || [])
        ];
        
        // Remove duplicates by story ID
        const uniqueStories = allStories.filter((story, index, arr) => 
          arr.findIndex(s => s.id === story.id) === index
        );
        
        filteredStories = uniqueStories.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
        
        console.log('✅ Stories loaded successfully:', filteredStories.length, 'total unique stories');

          // Map and set stories to keep UI consistent
          const storiesData = filteredStories.map((story: any) => {
            // Calculate word count from slides if not set or is 0
            const slides = Array.isArray(story.slides) ? story.slides : [];
            const calculatedWordCount = slides.reduce((total: number, slide: any) => {
              return total + (slide.word_count || 0);
            }, 0);
            
            // Check if this is a teaser (generated from snippet)
            const isTeaser = story.slidetype === 'short' && calculatedWordCount < 200;
            
            return {
              id: story.id,
              topic_article_id: story.topic_article_id,
              shared_content_id: story.shared_content_id,
              title: story.title,
              status: story.status,
              created_at: story.created_at,
              updated_at: story.updated_at,
              cover_illustration_url: story.cover_illustration_url,
              cover_illustration_prompt: story.cover_illustration_prompt,
              illustration_generated_at: story.illustration_generated_at,
              slides: slides,
              // Handle both legacy and multi-tenant sources
              url: story.article?.source_url || story.topic_article?.shared_content?.url || '',
              author: story.author || '',
              word_count: calculatedWordCount > 0 ? calculatedWordCount : (story.word_count || 0),
              slidetype: story.slidetype || '',
              tone: story.tone || '',
              writing_style: story.writing_style || '',
              audience_expertise: story.audience_expertise || '',
              is_teaser: isTeaser
            };
          });
          setStories(storiesData);
        
        // Calculate stats
        const newStats = {
          totalArticles: articlesResult.data?.length || 0,
          pendingArticles: (articlesResult.data || []).filter((a: any) => ['new', 'processed'].includes(a.processing_status)).length,
          processingQueue: queueResult.data?.length || 0,
          readyStories: filteredStories.filter((s: any) => s.status === 'ready').length || 0
        };
        setStats(newStats);

    } catch (error) {
      console.error('Error loading topic content:', error);
      toast({
        title: "Error loading content",
        description: "Failed to load multi-tenant topic content",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedTopicId, toast]);

  // Migration functions
  const testMigration = useCallback(async () => {
    if (!selectedTopicId) return null;

    const { data: legacyCount } = await supabase
      .from('articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', selectedTopicId);

    const { data: multiTenantCount } = await supabase
      .from('topic_articles')
      .select('id', { count: 'exact' })
      .eq('topic_id', selectedTopicId);

    return {
      legacy: legacyCount?.length || 0,
      multiTenant: multiTenantCount?.length || 0
    };
  }, [selectedTopicId]);

  const migrateTopicArticles = useCallback(async () => {
    if (!selectedTopicId) return;

    try {
      const { data, error } = await supabase.rpc('migrate_articles_to_multi_tenant', {
        p_limit: 1000
      });

      if (error) throw error;

      toast({
        title: "Migration completed",
        description: `Successfully migrated ${data || 0} articles to multi-tenant system`,
      });

      await loadTopicContent();
    } catch (error) {
      console.error('Migration failed:', error);
      toast({
        title: "Migration failed",
        description: "Failed to migrate articles to multi-tenant system",
        variant: "destructive",
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

  // Action handlers with proper callbacks
  const handleMultiTenantApprove = useCallback(async (
    article: MultiTenantArticle,
    slideType: 'short' | 'tabloid' | 'indepth' | 'extensive' = 'tabloid',
    tone: 'formal' | 'conversational' | 'engaging' = 'conversational',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    // Auto-detect snippets and default to 'short' (3 slides) for better experience
    const finalSlideType = article.is_snippet && slideType === 'tabloid' ? 'short' : slideType;
    
    await approveMultiTenantArticle(article, finalSlideType, tone, writingStyle);
    // Force immediate reload to show approval/queue addition
    await loadTopicContent();
  }, [approveMultiTenantArticle, loadTopicContent, articles]);

  const handleMultiTenantDelete = useCallback(async (articleId: string, articleTitle: string) => {
    await deleteMultiTenantArticle(articleId, articleTitle);
    // Force immediate reload to show deletion
    await loadTopicContent();
  }, [deleteMultiTenantArticle, loadTopicContent]);

  const handleMultiTenantBulkDelete = useCallback(async (articleIds: string[]) => {
    await deleteMultipleMultiTenantArticles(articleIds);
    // Force immediate reload to show bulk deletion
    await loadTopicContent();
  }, [deleteMultipleMultiTenantArticles, loadTopicContent]);

  const handleMultiTenantCancelQueue = useCallback(async (queueId: string) => {
    await cancelMultiTenantQueueItem(queueId);
    await loadTopicContent();
  }, [cancelMultiTenantQueueItem, loadTopicContent]);

  const handleMultiTenantApproveStory = useCallback(async (storyId: string) => {
    await approveMultiTenantStory(storyId);
    await loadTopicContent();
  }, [approveMultiTenantStory, loadTopicContent]);

  const handleMultiTenantRejectStory = useCallback(async (storyId: string) => {
    await rejectMultiTenantStory(storyId);
    await loadTopicContent();
  }, [rejectMultiTenantStory, loadTopicContent]);

  const markArticleAsDiscarded = useCallback(async (articleId: string) => {
    if (!selectedTopicId) return;
    
    try {
      const { error } = await supabase
        .from('topic_articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);
      
      if (error) throw error;
      
      toast({
        title: "Article discarded",
        description: "Article has been marked as discarded",
      });
      await loadTopicContent();
    } catch (error) {
      console.error('Error marking article as discarded:', error);
      toast({
        title: "Error",
        description: "Failed to discard article",
        variant: "destructive",
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

  const promoteTopicArticle = useCallback(async (topicArticleId: string) => {
    if (!selectedTopicId) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('promote-topic-article', {
        body: { topicArticleId }
      });
      
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      
      toast({
        title: "Article promoted",
        description: `Article "${data.title}" promoted to published queue`,
      });
      await loadTopicContent();
    } catch (error) {
      console.error('Error promoting article:', error);
      toast({
        title: "Promotion failed",
        description: "Failed to promote article to published queue",
        variant: "destructive",
      });
    }
  }, [selectedTopicId, loadTopicContent, toast]);

  // Load content when topic changes
  useEffect(() => {
    if (selectedTopicId) {
      loadTopicContent();
    }
  }, [selectedTopicId, loadTopicContent]);

  // Real-time subscriptions
  useEffect(() => {
    if (!selectedTopicId) return;

    const channel = supabase
      .channel('multi-tenant-topic-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topic_articles'
        },
        () => {
          console.log('Topic articles changed, reloading...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'shared_article_content'
        },
        () => {
          console.log('Shared content changed, reloading...');
          loadTopicContent();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId, loadTopicContent]);

  return {
    // Data
    articles,
    queueItems,
    stories,
    stats,
    
    // Loading states
    loading,
    
    // Functions
    loadTopicContent,
    testMigration,
    migrateTopicArticles,
    setArticles,
    setQueueItems,
    setStories,
    setStats,
    
    // Multi-tenant actions
    handleMultiTenantApprove,
    handleMultiTenantDelete,
    handleMultiTenantBulkDelete,
    handleMultiTenantCancelQueue,
    handleMultiTenantApproveStory,
    handleMultiTenantRejectStory,
    markArticleAsDiscarded,
    promoteTopicArticle,
    
    // Multi-tenant action states from useMultiTenantActions
    processingArticle,
    deletingArticles,
    animatingArticles // New animation state
  };
};