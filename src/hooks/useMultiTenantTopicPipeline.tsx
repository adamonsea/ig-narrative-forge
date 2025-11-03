import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";

export interface MultiTenantArticle {
  id: string;
  shared_content_id: string | null;
  topic_id: string;
  source_id: string | null;
  regional_relevance_score: number;
  content_quality_score: number;
  import_metadata: any;
  originality_confidence: number;
  created_at: string;
  updated_at: string;
  processing_status: string;
  keyword_matches: string[];
  url: string;
  normalized_url: string;
  title: string;
  body?: string;
  author?: string;
  image_url?: string;
  canonical_url?: string;
  content_checksum?: string;
  published_at?: string;
  word_count: number;
  language: string;
  source_domain?: string;
  last_seen_at: string;
  is_snippet?: boolean;
  article_type?: 'legacy' | 'multi_tenant';
}

export interface MultiTenantQueueItem {
  id: string;
  article_id?: string | null;
  topic_article_id?: string | null;
  shared_content_id?: string | null;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  attempts: number;
  max_attempts: number;
  error_message?: string;
  result_data: any;
  slidetype: string;
  tone: string;
  audience_expertise: string;
  ai_provider: string;
  writing_style: string;
  title?: string;
  article_title?: string;
  article_url?: string;
}

export interface MultiTenantStory {
  id: string;
  article_id?: string | null;
  topic_article_id?: string | null;
  headline: string;
  summary?: string;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  slides: any[];
  article_title: string;
  story_type: 'legacy' | 'multi_tenant';
  title?: string;
  url?: string;
  author?: string;
  word_count?: number;
  cover_illustration_url?: string;
  cover_illustration_prompt?: string;
  illustration_generated_at?: string;
  animated_illustration_url?: string;
  slidetype?: string;
  tone?: string;
  writing_style?: string;
  audience_expertise?: string;
  is_teaser?: boolean;
  is_parliamentary?: boolean;
}

export interface MultiTenantStats {
  articles: number;
  queueItems: number;
  stories: number;
  totalArticles?: number;
  pendingArticles?: number;
  processingQueue?: number;
  readyStories?: number;
}

export const useMultiTenantTopicPipeline = (selectedTopicId: string | null) => {
  const { toast } = useToast();
  const [articles, setArticles] = useState<MultiTenantArticle[]>([]);
  const [queueItems, setQueueItems] = useState<MultiTenantQueueItem[]>([]);
  const [stories, setStories] = useState<MultiTenantStory[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<MultiTenantStats>({
    articles: 0,
    queueItems: 0,
    stories: 0
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

      // Get ONLY multi-tenant articles for arrivals (no legacy articles)
      const multiTenantArticlesResult = await supabase.rpc('get_topic_articles_multi_tenant', {
        p_topic_id: selectedTopicId,
        p_status: null, // Get all statuses to filter out processed ones
        p_limit: 100 // Increased limit to ensure more content
      });

      if (multiTenantArticlesResult.error) {
        console.error('Error loading multi-tenant articles:', multiTenantArticlesResult.error);
        toast({
          title: "Error loading articles",
          description: "Failed to load articles. Please try refreshing.",
          variant: "destructive",
        });
      }

      // Get story IDs to filter out articles that are already published or queued for this topic
      const { data: publishedStoriesData } = await supabase
        .from('stories')
        .select('topic_article_id, topic_articles!inner(topic_id)')
        .in('status', ['published', 'ready'])
        .eq('topic_articles.topic_id', selectedTopicId)
        .not('topic_article_id', 'is', null);
      
      const publishedMultiTenantIds = new Set(publishedStoriesData?.map(s => s.topic_article_id) || []);

      // Get pending/processing queue items to hide approved articles  
      const { data: queueItemsForFiltering } = await supabase
        .from('content_generation_queue')
        .select('topic_article_id')
        .in('status', ['pending', 'processing'])
        .not('topic_article_id', 'is', null);
      
      const queuedMultiTenantIds = new Set(queueItemsForFiltering?.map(q => q.topic_article_id) || []);

      // Deterministically exclude parliamentary items at topic_article level using import_metadata
      const isParliamentaryArticle = (item: any) => {
        const metadata = item.import_metadata || {};
        return (
          metadata.source === 'parliamentary_vote' ||
          metadata.parliamentary_vote === true ||
          metadata.source === 'parliamentary_weekly_roundup'
        );
      };

      const parliamentaryExcluded = (multiTenantArticlesResult.data || []).filter(isParliamentaryArticle).length;
      
      // Process ONLY multi-tenant articles (including snippets) that are still available for processing
      const rawMultiTenantArticles = (multiTenantArticlesResult.data || [])
        .filter((item: any) => 
          ['new', 'processed'].includes(item.processing_status) && // Show both new and processed articles
          !publishedMultiTenantIds.has(item.id) &&
          !queuedMultiTenantIds.has(item.id) &&
          !isParliamentaryArticle(item) // Exclude parliamentary items deterministically
        )
        .map((item: any) => {
          const wordCount = item.word_count || 0;
          const isSnippet = wordCount > 0 && wordCount < 150;
          return {
            id: item.id,
            shared_content_id: item.shared_content_id,
            topic_id: selectedTopicId,
            source_id: item.source_id,
            regional_relevance_score: item.regional_relevance_score || 0,
            content_quality_score: item.content_quality_score || 0,
            import_metadata: item.import_metadata || {},
            originality_confidence: item.originality_confidence || 100,
            created_at: item.created_at,
            updated_at: item.updated_at,
            processing_status: item.processing_status,
            keyword_matches: item.keyword_matches || [],
            url: item.url,
            normalized_url: item.normalized_url || item.url,
            title: item.title,
            body: item.body,
            author: item.author,
            image_url: item.image_url,
            canonical_url: item.canonical_url,
            content_checksum: item.content_checksum,
            published_at: item.published_at,
            word_count: wordCount,
            language: item.language || 'en',
            source_domain: item.source_domain,
            last_seen_at: item.last_seen_at || item.updated_at,
            is_snippet: isSnippet,
            article_type: 'multi_tenant' as const
          };
        });

      // Deduplicate articles by normalized title and shared_content_id
      const seenTitles = new Set();
      const seenContentIds = new Set();
      const allArticles = rawMultiTenantArticles
        .filter(article => {
          const normalizedTitle = article.title.toLowerCase().trim();
          
          // Skip if we've seen this exact title
          if (seenTitles.has(normalizedTitle)) {
            console.log('🔄 Duplicate title filtered:', normalizedTitle);
            return false;
          }
          
          // Skip if we've seen this shared content ID
          if (article.shared_content_id && seenContentIds.has(article.shared_content_id)) {
            console.log('🔄 Duplicate content ID filtered:', article.shared_content_id);
            return false;
          }
          
          // Add to seen sets
          seenTitles.add(normalizedTitle);
          if (article.shared_content_id) {
            seenContentIds.add(article.shared_content_id);
          }
          
          return true;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      console.log('🧪 Multi-Tenant Only Pipeline - Articles Loaded:', {
        rawMultiTenant: (multiTenantArticlesResult.data || []).length,
        parliamentaryExcluded,
        afterFiltering: rawMultiTenantArticles.length,
        afterDeduplication: allArticles.length,
        publishedMultiTenant: publishedMultiTenantIds.size,
        queuedMultiTenant: queuedMultiTenantIds.size,
        selectedTopicId,
        duplicatesRemoved: rawMultiTenantArticles.length - allArticles.length
      });

      if (allArticles.length === 0) {
        console.log('🔍 Empty Multi-Tenant Feed Analysis:', {
          multiTenantRawCount: multiTenantArticlesResult.data?.length || 0,
          publishedCount: publishedStoriesData?.length || 0,
          queuedCount: queueItemsForFiltering?.length || 0,
          message: 'All multi-tenant articles have been either published or are in processing queue'
        });
      }

      setArticles(allArticles);
      // Declare variables for filtered data
      let filteredQueueItems: any[] = [];
      let filteredStories: any[] = [];

      // Get ONLY multi-tenant queue items for this topic
      const multiTenantQueueResult = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          topic_article_id,
          shared_content_id,
          status,
          created_at,
          started_at,
          completed_at,
          attempts,
          max_attempts,
          error_message,
          slidetype,
          tone,
          writing_style,
          topic_articles!inner(
            id, topic_id,
            shared_content:shared_article_content(title, url)
          )
        `)
        .eq('topic_articles.topic_id', selectedTopicId)
        .in('status', ['pending', 'processing'])
        .order('created_at', { ascending: false });

      console.log('🔄 Multi-tenant queue items loaded:', {
        multiTenant: multiTenantQueueResult.data?.length || 0,
        multiTenantError: multiTenantQueueResult.error
      });

      if (multiTenantQueueResult.error) {
        console.error('Error loading multi-tenant queue items:', multiTenantQueueResult.error);
        setQueueItems([]);
      } else {
        // Process ONLY multi-tenant queue items
        filteredQueueItems = (multiTenantQueueResult.data || []).map((item: any) => ({
          ...item,
          title: item.topic_articles?.shared_content?.title || 'Unknown Title',
          article_url: item.topic_articles?.shared_content?.url || ''
        })).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const queueItemsData = filteredQueueItems.map((item: any) => ({
          id: item.id,
          article_id: item.article_id || null,
          topic_article_id: item.topic_article_id || null,
          shared_content_id: item.shared_content_id || null,
          status: item.status,
          created_at: item.created_at,
          started_at: item.started_at,
          completed_at: item.completed_at,
          attempts: item.attempts || 0,
          max_attempts: item.max_attempts || 3,
          error_message: item.error_message,
          result_data: item.result_data || {},
          slidetype: item.slidetype || 'tabloid',
          tone: item.tone || 'conversational',
          audience_expertise: item.audience_expertise || 'intermediate',
          ai_provider: item.ai_provider || 'deepseek',
          writing_style: item.writing_style || 'journalistic',
          title: item.title,
          article_title: item.title,
          article_url: item.article_url
        }));
        setQueueItems(queueItemsData);
        
        console.log('✅ Multi-tenant queue items processed:', queueItemsData.length, 'items found');
      }

      console.log('🔄 Loading all stories for topic:', selectedTopicId);

      // Fetch tracked MPs for this topic to filter parliamentary stories
      const { data: trackedMPs } = await supabase
        .from('topic_tracked_mps')
        .select('mp_name, constituency, mp_id')
        .eq('topic_id', selectedTopicId);

      console.log('🗳️ Tracked MPs for filtering:', trackedMPs?.length || 0);

      // Use the new unified admin function for all stories (including published ones)
      const topicStoriesResult = await supabase
        .rpc('get_admin_topic_stories', {
          p_topic_id: selectedTopicId,
          p_status: null, // Get all stories - we'll filter on the frontend
          p_limit: 200,
          p_offset: 0
        });

      console.log('📊 Admin stories query results:', {
        stories: topicStoriesResult.data?.length || 0,
        error: topicStoriesResult.error
      });

      if (topicStoriesResult.error) {
        console.error('Error loading topic stories:', topicStoriesResult.error);
        setStories([]);
        return;
      }

      // Use the clean, unified data with frontend deduplication as safety net
      const allStories = topicStoriesResult.data || [];
      
      // Frontend deduplication safety net
      const seenStoryIds = new Set();
      const deduplicatedStories = allStories.filter((story: any) => {
        if (seenStoryIds.has(story.id)) {
          console.warn('🚨 Duplicate story detected and filtered:', story.id, story.title);
          return false;
        }
        seenStoryIds.add(story.id);
        return true;
      });
      
      // The RPC already returns clean, deduplicated data - this is just a safety net
      const sortedStories = deduplicatedStories.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      console.log('✅ Stories loaded successfully:', sortedStories.length, 'total stories');
      
      // Validation logging for QA
      const publishedCount = sortedStories.filter(s => s.is_published && ['ready', 'published'].includes(s.status)).length;
      console.log('📊 Published Stories Validation:', {
        totalStories: sortedStories.length,
        publishedCount,
        readyCount: sortedStories.filter(s => s.status === 'ready' && s.is_published).length,
        publishedStatusCount: sortedStories.filter(s => s.status === 'published' && s.is_published).length
      });

      // Load slides for stories to enable edit functionality
      const storyIds = sortedStories.map((story: any) => story.id);
      let slidesData: any[] = [];
      let parliamentaryData: any[] = [];
      
      if (storyIds.length > 0) {
        const { data: slidesResult, error: slidesError } = await supabase
          .from('slides')
          .select('*')
          .in('story_id', storyIds)
          .order('slide_number');
        
        if (slidesError) {
          console.error('Error loading slides:', slidesError);
        } else {
          slidesData = slidesResult || [];
        }

        // Load parliamentary mentions to identify parliamentary stories
        const { data: parliamentaryResult, error: parliamentaryError } = await supabase
          .from('parliamentary_mentions')
          .select('story_id')
          .in('story_id', storyIds);
        
        if (parliamentaryError) {
          console.error('Error loading parliamentary mentions:', parliamentaryError);
        } else {
          parliamentaryData = parliamentaryResult || [];
        }
      }

      const parliamentaryStoryIds = new Set(parliamentaryData.map(p => p.story_id));

      // Create tracked MPs lookup set for fast filtering (using mp_name + constituency)
      const trackedMPSet = new Set(
        trackedMPs?.map(mp => 
          `${mp.mp_name.toLowerCase().trim()}|${mp.constituency.toLowerCase().trim()}`
        ) || []
      );

      // Get parliamentary mentions for filtering (only mp_name and constituency exist in this table)
      const { data: allParliamentaryMentions } = await supabase
        .from('parliamentary_mentions')
        .select('story_id, mp_name, constituency')
        .in('story_id', sortedStories.map(s => s.id).filter(id => parliamentaryStoryIds.has(id)));

      // Create map of story_id -> mention for filtering
      const storyMentionMap = new Map(
        allParliamentaryMentions?.map(m => [m.story_id, m]) || []
      );

      // Filter parliamentary stories - only keep those with tracked MPs
      const parliamentaryFilteredStories = sortedStories.filter((story: any) => {
        const isParliamentary = parliamentaryStoryIds.has(story.id);
        
        if (!isParliamentary) return true; // Keep all non-parliamentary stories

        // For parliamentary stories, check if MP is tracked
        const mention = storyMentionMap.get(story.id);
        if (!mention || !mention.mp_name || !mention.constituency) {
          console.warn('🚫 Parliamentary story without valid mention:', story.id, story.title);
          return false;
        }

        const mentionKey = `${mention.mp_name.toLowerCase().trim()}|${mention.constituency.toLowerCase().trim()}`;
        const isTracked = trackedMPSet.has(mentionKey);

        if (!isTracked) {
          console.log('🗳️ Filtered out parliamentary story (MP not tracked):', {
            storyId: story.id,
            title: story.title,
            mp: mention.mp_name,
            constituency: mention.constituency
          });
        }

        return isTracked;
      });

      console.log(`🗳️ Parliamentary filter: ${sortedStories.filter(s => parliamentaryStoryIds.has(s.id)).length} total, ${parliamentaryFilteredStories.filter(s => parliamentaryStoryIds.has(s.id)).length} after filtering`);

      // Map to MultiTenantStory shape - the RPC already provides clean data structure
      const storiesData = parliamentaryFilteredStories.map((story: any) => {
        const storySlides = slidesData.filter(slide => slide.story_id === story.id);
        const isParliamentary = parliamentaryStoryIds.has(story.id);
        
        console.log('🔍 Story mapping debug:', {
          storyId: story.id,
          storyTitle: story.article_title || story.title,
          slideCount: story.slide_count || 0,
          actualSlides: storySlides.length,
          isParliamentary
        });
        
        return {
          id: story.id,
          article_id: story.article_id || null,
          topic_article_id: story.topic_article_id || null,
          headline: story.title || story.article_title || 'Untitled',
          summary: story.summary || '',
          status: story.status,
          is_published: story.is_published,
          created_at: story.created_at,
          updated_at: story.updated_at,
          slides: storySlides, // Now properly loaded with slide data
          article_title: story.article_title,
          story_type: story.story_type,
          title: story.title,
          url: story.article_url,
          author: story.article_author,
          word_count: story.word_count,
          cover_illustration_url: story.cover_illustration_url,
          cover_illustration_prompt: story.cover_illustration_prompt,
          illustration_generated_at: story.illustration_generated_at,
          animated_illustration_url: story.animated_illustration_url,
          slidetype: story.slide_type,
          tone: story.tone || '',
          writing_style: story.writing_style || '',
          audience_expertise: story.audience_expertise || '',
          is_teaser: story.is_teaser || false,
          is_parliamentary: isParliamentary
        };
      });

      console.log('📊 Final stories data with slides:', {
        totalStories: storiesData.length,
        storiesWithSlides: storiesData.filter(s => s.slides.length > 0).length,
        slideDistribution: storiesData.map(s => ({ id: s.id, title: s.title, slideCount: s.slides.length }))
      });

      setStories(storiesData);
      
      // Calculate stats using the processed data
      setStats({
        articles: allArticles.length,
        queueItems: filteredQueueItems.length,
        stories: storiesData.length,
        totalArticles: allArticles.length,
        pendingArticles: allArticles.filter((a: any) => a.processing_status === 'new').length,
        processingQueue: filteredQueueItems.length,
        readyStories: storiesData.filter((s: any) => ['draft', 'ready'].includes(s.status)).length
      });

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
    tone: 'formal' | 'conversational' | 'engaging' | 'satirical' = 'conversational',
    writingStyle: 'journalistic' | 'educational' | 'listicle' | 'story_driven' = 'journalistic'
  ) => {
    // Auto-detect snippets and default to 'short' (3 slides) for better experience
    const finalSlideType = article.is_snippet && slideType === 'tabloid' ? 'short' : slideType;
    
    // Optimistically hide the article from Arrivals immediately
    setArticles(prev => prev.filter(a => a.id !== article.id));
    
    if (article.article_type === 'legacy') {
      // Handle legacy article approval
      const { error } = await supabase.rpc('approve_article_for_generation', {
        article_uuid: article.id
      });
      if (error) throw error;
    } else {
      // Handle multi-tenant article approval
      await approveMultiTenantArticle(article, finalSlideType, tone, writingStyle);
    }
    
    // Reload to update all sections and show the queue item
    await loadTopicContent();
  }, [approveMultiTenantArticle, loadTopicContent, supabase]);

  const handleMultiTenantDelete = useCallback(async (articleId: string, articleTitle: string) => {
    // Find the article to determine its type
    const article = articles.find(a => a.id === articleId);
    if (!article) return;

    if (article.article_type === 'legacy') {
      // Handle legacy article deletion
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .eq('id', articleId);
      
      if (error) {
        console.error('Error deleting legacy article:', error);
        toast({
          title: "Error",
          description: "Failed to delete article",
          variant: "destructive"
        });
        return;
      }
    } else {
      // Handle multi-tenant article deletion
      await deleteMultiTenantArticle(articleId, articleTitle);
    }
    
    // Force immediate reload to show deletion
    await loadTopicContent();
  }, [articles, deleteMultiTenantArticle, loadTopicContent, toast, supabase]);

  const handleMultiTenantBulkDelete = useCallback(async (articleIds: string[]) => {
    // Split into legacy vs multi-tenant
    const legacyIds = articles.filter(a => articleIds.includes(a.id) && a.article_type === 'legacy').map(a => a.id);
    const multiTenantIds = articleIds.filter(id => !legacyIds.includes(id));

    if (legacyIds.length > 0) {
      const { error: legacyError } = await supabase
        .from('articles')
        .update({ processing_status: 'discarded' })
        .in('id', legacyIds);
      if (legacyError) {
        console.error('Error discarding legacy articles:', legacyError);
      }
    }

    if (multiTenantIds.length > 0) {
      await deleteMultipleMultiTenantArticles(multiTenantIds);
    }

    // Force immediate reload to show bulk deletion
    await loadTopicContent();
  }, [articles, deleteMultipleMultiTenantArticles, loadTopicContent]);

  const handleMultiTenantCancelQueue = useCallback(async (queueId: string) => {
    await cancelMultiTenantQueueItem(queueId);
    await loadTopicContent();
  }, [cancelMultiTenantQueueItem, loadTopicContent]);

  const handleMultiTenantApproveStory = useCallback(async (storyId: string) => {
    await approveMultiTenantStory(storyId, selectedTopicId);
    await loadTopicContent();
  }, [approveMultiTenantStory, selectedTopicId, loadTopicContent]);

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

  // Real-time subscriptions for granular updates
  useEffect(() => {
    if (!selectedTopicId) return;

    console.log('🔄 Setting up real-time subscriptions for topic:', selectedTopicId);

    const channel = supabase
      .channel('multi-tenant-topic-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'topic_articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        async (payload) => {
          console.log('🔄 New topic article detected, refreshing arrivals...', payload);
          // Reload only articles section
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'topic_articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        async (payload) => {
          console.log('🔄 Topic article updated, refreshing...', payload);
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'stories'
        },
        async (payload) => {
          console.log('🔄 New story detected, checking if for this topic...', payload);
          const newStory = payload.new as any;
          
          // Check if story belongs to this topic
          if (newStory.topic_article_id) {
            const { data: topicArticle } = await supabase
              .from('topic_articles')
              .select('topic_id')
              .eq('id', newStory.topic_article_id)
              .single();
            
            if (topicArticle?.topic_id === selectedTopicId) {
              console.log('✅ Story belongs to this topic, refreshing published queue...');
              loadTopicContent();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories'
        },
        async (payload) => {
          console.log('🔄 Story updated, checking if for this topic...', payload);
          const updatedStory = payload.new as any;
          
          // Check if this story is already in our list
          const existingStory = stories.find(s => s.id === updatedStory.id);
          if (existingStory) {
            console.log('✅ Story in our list, refreshing published queue...');
            loadTopicContent();
          } else if (updatedStory.topic_article_id) {
            // Check if story belongs to this topic
            const { data: topicArticle } = await supabase
              .from('topic_articles')
              .select('topic_id')
              .eq('id', updatedStory.topic_article_id)
              .single();
            
            if (topicArticle?.topic_id === selectedTopicId) {
              console.log('✅ Updated story belongs to this topic, refreshing...');
              loadTopicContent();
            }
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'slides'
        },
        async (payload) => {
          const slide = payload.new as any;
          const existingStory = stories.find(s => s.id === slide?.story_id);
          
          if (existingStory) {
            console.log('🔄 Slide changed for story in this topic, refreshing...', payload);
            loadTopicContent();
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_generation_queue'
        },
        async (payload) => {
          console.log('🔄 Queue item changed, checking if for this topic...', payload);
          const queueItem = payload.new as any;
          
          if (queueItem?.topic_article_id) {
            const { data: topicArticle } = await supabase
              .from('topic_articles')
              .select('topic_id')
              .eq('id', queueItem.topic_article_id)
              .single();
            
            if (topicArticle?.topic_id === selectedTopicId) {
              console.log('✅ Queue item belongs to this topic, refreshing processing queue...');
              loadTopicContent();
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('🔄 Real-time subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId, loadTopicContent, stories]);

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