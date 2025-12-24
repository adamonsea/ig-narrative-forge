import { useState, useEffect, useCallback, useRef } from "react";
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
  scheduled_publish_at?: string | null;
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

const ARTICLES_PAGE_SIZE = 50;

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

  // Pagination state for articles
  const [articlesPage, setArticlesPage] = useState(1);
  const [totalArticlesCount, setTotalArticlesCount] = useState<number | null>(null);
  const [hasMoreArticles, setHasMoreArticles] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // New content indicators for real-time updates
  const [newArrivals, setNewArrivals] = useState(false);
  const [newPublished, setNewPublished] = useState(false);

  // Refs to avoid re-subscribing realtime channels on every list update
  const storiesRef = useRef<MultiTenantStory[]>([]);
  const queueItemsRef = useRef<MultiTenantQueueItem[]>([]);

  useEffect(() => {
    storiesRef.current = stories;
  }, [stories]);

  useEffect(() => {
    queueItemsRef.current = queueItems;
  }, [queueItems]);

  // Cache for topic article associations to prevent redundant DB queries
  const topicArticleCacheRef = useRef<{
    topicArticleIds: Set<string>;
    sharedContentIds: Set<string>;
  }>({
    topicArticleIds: new Set(),
    sharedContentIds: new Set(),
  });

  // Debounce timer for real-time refreshes
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Previous counts to detect new content
  const previousCountsRef = useRef<{
    articles: number;
    stories: number;
  }>({ articles: 0, stories: 0 });

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
      // Use pagination - first page loads with reset
      const multiTenantArticlesResult = await supabase.rpc('get_topic_articles_multi_tenant', {
        p_topic_id: selectedTopicId,
        p_status: null, // Get all statuses to filter out processed ones
        p_limit: ARTICLES_PAGE_SIZE,
        p_offset: 0 // Always start from first page on initial load
      });
      
      // Get total count for pagination display - only 'new' articles that haven't been processed yet
      const { count: totalCount } = await supabase
        .from('topic_articles')
        .select('id', { count: 'exact', head: true })
        .eq('topic_id', selectedTopicId)
        .eq('processing_status', 'new');
      
      setTotalArticlesCount(totalCount || 0);
      setArticlesPage(1); // Reset to first page

      if (multiTenantArticlesResult.error) {
        console.error('Error loading multi-tenant articles:', multiTenantArticlesResult.error);
        toast({
          title: "Error loading articles",
          description: "Failed to load articles. Please try refreshing.",
          variant: "destructive",
        });
      }

      // Get story IDs to filter out articles that are already published or queued for this topic
      // Use RPC function to avoid URL length limits with large ID lists
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
      
      // Update hasMoreArticles based on total count
      const filteredTotal = totalCount || 0;
      setHasMoreArticles(allArticles.length < filteredTotal);

      // Detect new arrivals for visual indicator
      if (previousCountsRef.current.articles > 0 && allArticles.length > previousCountsRef.current.articles) {
        console.log('🆕 New arrivals detected!', {
          previous: previousCountsRef.current.articles,
          current: allArticles.length,
          new: allArticles.length - previousCountsRef.current.articles
        });
        setNewArrivals(true);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setNewArrivals(false), 5000);
      }
      previousCountsRef.current.articles = allArticles.length;

      // Update cache with loaded article IDs
      topicArticleCacheRef.current = {
        topicArticleIds: new Set(allArticles.map(article => article.id)),
        sharedContentIds: new Set(
          allArticles
            .map(article => article.shared_content_id)
            .filter((id): id is string => typeof id === "string" && id.length > 0)
        ),
      };

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
      // NOTE: get_admin_topic_stories may not include drip-feed "ready but not yet published" items.
      // We explicitly include those so they appear in the Published tab as "Queued" (blue) or "Scheduled" (amber).
      const { data: dripQueuedStories, error: dripQueuedError } = await supabase
        .from('stories')
        .select(`
          id,
          article_id,
          topic_article_id,
          title,
          status,
          is_published,
          is_parliamentary,
          created_at,
          updated_at,
          scheduled_publish_at,
          drip_queued_at,
          cover_illustration_url,
          cover_illustration_prompt,
          illustration_generated_at,
          animated_illustration_url,
          slide_type,
          tone,
          writing_style,
          audience_expertise,
          shared_content_id,
          slides(id, slide_number, content, word_count, alt_text, visual_prompt, links),
          topic_articles!inner(
            topic_id,
            shared_content:shared_article_content(title, url, author, word_count)
          )
        `)
        .eq('topic_articles.topic_id', selectedTopicId)
        .eq('status', 'ready')
        .eq('is_published', false)
        .order('updated_at', { ascending: false })
        .limit(200);

      if (dripQueuedError) {
        console.warn('⚠️ Failed to load drip-queued stories (ready + not published):', dripQueuedError);
      }

      const dripQueuedAsAdminRows = (dripQueuedStories || []).map((s: any) => {
        const shared = s.topic_articles?.shared_content;
        // Include slides directly from the query
        const slides = (s.slides || []).sort((a: any, b: any) => a.slide_number - b.slide_number);
        return {
          id: s.id,
          article_id: s.article_id || null,
          topic_article_id: s.topic_article_id || null,
          title: s.title || shared?.title || 'Untitled',
          status: s.status,
          is_published: s.is_published,
          created_at: s.created_at,
          updated_at: s.updated_at,
          article_title: shared?.title || s.title || 'Untitled',
          article_url: shared?.url || null,
          article_author: shared?.author || null,
          word_count: shared?.word_count || null,
          slide_count: slides.length,
          slides: slides,
          story_type: s.topic_article_id ? 'multi_tenant' : 'legacy',
          is_teaser: false,
          is_parliamentary: s.is_parliamentary || false,
          cover_illustration_url: s.cover_illustration_url,
          cover_illustration_prompt: s.cover_illustration_prompt,
          illustration_generated_at: s.illustration_generated_at,
          animated_illustration_url: s.animated_illustration_url,
          slide_type: s.slide_type,
          tone: s.tone,
          writing_style: s.writing_style,
          audience_expertise: s.audience_expertise,
          scheduled_publish_at: s.scheduled_publish_at || null,
        };
      });

      console.log('🟦 Drip-feed queued stories included:', {
        count: dripQueuedAsAdminRows.length,
      });

      const allStories = [...(topicStoriesResult.data || []), ...dripQueuedAsAdminRows];

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
          source_url: story.article_url,
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
          is_parliamentary: isParliamentary,
          scheduled_publish_at: story.scheduled_publish_at || null
        };
      });

      console.log('📊 Final stories data with slides:', {
        totalStories: storiesData.length,
        storiesWithSlides: storiesData.filter(s => s.slides.length > 0).length,
        slideDistribution: storiesData.map(s => ({ id: s.id, title: s.title, slideCount: s.slides.length }))
      });

      setStories(storiesData);
      
      // Detect new published stories for visual indicator
      const publishedStories = storiesData.filter((s: any) => s.is_published && ['ready', 'published'].includes(s.status));
      if (previousCountsRef.current.stories > 0 && publishedStories.length > previousCountsRef.current.stories) {
        console.log('🆕 New published stories detected!', {
          previous: previousCountsRef.current.stories,
          current: publishedStories.length,
          new: publishedStories.length - previousCountsRef.current.stories
        });
        setNewPublished(true);
        // Auto-dismiss after 5 seconds
        setTimeout(() => setNewPublished(false), 5000);
      }
      previousCountsRef.current.stories = publishedStories.length;
      
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

  // Smart topic ownership checker with caching
  const isTopicArticleForSelectedTopic = useCallback(async (
    topicArticleId?: string | null,
    sharedContentId?: string | null
  ) => {
    if (!selectedTopicId) return false;

    if (topicArticleId) {
      // Check cache first
      if (
        topicArticleCacheRef.current.topicArticleIds.has(topicArticleId) ||
        storiesRef.current.some(story => story.topic_article_id === topicArticleId) ||
        queueItemsRef.current.some(item => item.topic_article_id === topicArticleId)
      ) {
        return true;
      }

      // Fallback to database query
      const { data, error } = await supabase
        .from('topic_articles')
        .select('topic_id')
        .eq('id', topicArticleId)
        .limit(1);

      if (error) {
        console.error("Error checking topic article association:", error);
        return false;
      }

      const belongs = !!(data && data.length > 0 && data[0]?.topic_id === selectedTopicId);

      if (belongs) {
        topicArticleCacheRef.current.topicArticleIds.add(topicArticleId);
      }

      return belongs;
    }

    if (sharedContentId) {
      // Check cache for shared content
      if (topicArticleCacheRef.current.sharedContentIds.has(sharedContentId)) {
        return true;
      }

      const { data, error } = await supabase
        .from('topic_articles')
        .select('id')
        .eq('shared_content_id', sharedContentId)
        .eq('topic_id', selectedTopicId)
        .limit(1);

      if (error) {
        console.error("Error checking shared content association:", error);
        return false;
      }

      const belongs = !!(data && data.length > 0);

      if (belongs) {
        topicArticleCacheRef.current.sharedContentIds.add(sharedContentId);
      }

      return belongs;
    }

    return false;
  }, [selectedTopicId]);

  // Story ownership checker
  const doesStoryBelongToTopic = useCallback(async (storyRecord: any) => {
    if (!storyRecord) return false;

    // Check multi-tenant articles
    if (storyRecord.topic_article_id || storyRecord.shared_content_id) {
      return isTopicArticleForSelectedTopic(storyRecord.topic_article_id, storyRecord.shared_content_id);
    }

    // Check legacy articles
    if (storyRecord.article_id) {
      if (storiesRef.current.some(story => story.article_id === storyRecord.article_id)) {
        return true;
      }

      const { data, error } = await supabase
        .from('articles')
        .select('topic_id')
        .eq('id', storyRecord.article_id)
        .limit(1);

      if (error) {
        console.error("Error checking legacy article association:", error);
        return false;
      }

      return !!(data && data.length > 0 && data[0]?.topic_id === selectedTopicId);
    }

    return false;
  }, [isTopicArticleForSelectedTopic, selectedTopicId]);

  // Load content when topic changes
  useEffect(() => {
    // Clear cache when topic changes to prevent stale IDs
    topicArticleCacheRef.current = {
      topicArticleIds: new Set(),
      sharedContentIds: new Set(),
    };
    
    if (selectedTopicId) {
      loadTopicContent();
    }
  }, [selectedTopicId, loadTopicContent]);

  // Real-time subscriptions with smart topic filtering
  useEffect(() => {
    if (!selectedTopicId) return;

    console.log('🔄 Setting up real-time subscriptions for topic:', selectedTopicId);

    const channel = supabase
      .channel(`multi-tenant-topic-changes-${selectedTopicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'topic_articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        async (payload) => {
          console.log('🔄 Topic article change detected, refreshing arrivals...', payload);
          
          // Debounced refresh
          if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current);
          }
          debounceTimerRef.current = setTimeout(() => {
            loadTopicContent();
          }, 300);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories',
          filter: `topic_article_id=not.is.null` // Only listen to multi-tenant stories
        },
        async (payload) => {
          console.log('🔄 Story change detected, checking if for this topic...', payload);
          const storyRecord = (payload.new || payload.old) as any;

          // Optimistic check: if story is already in our list, it belongs to us
          if (storyRecord.id && storiesRef.current.some(s => s.id === storyRecord.id)) {
            console.log('✅ Story already in topic list (optimistic), refreshing...');
            
            // Debounced refresh
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              loadTopicContent();
            }, 300);
            return;
          }

          // Otherwise do full async check
          if (await doesStoryBelongToTopic(storyRecord)) {
            console.log('✅ Story belongs to this topic (verified), refreshing story lists...');
            
            // Debounced refresh
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              loadTopicContent();
            }, 300);
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
          const slide = (payload.new || payload.old) as any;
          const existingStory = stories.find(s => s.id === slide?.story_id);

          if (existingStory) {
            console.log('🔄 Slide change for story in this topic, refreshing...', payload);
            
            // Debounced refresh
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              loadTopicContent();
            }, 300);
            return;
          }

          if (slide?.story_id) {
            const { data, error } = await supabase
              .from('stories')
              .select('id, topic_article_id, shared_content_id, article_id')
              .eq('id', slide.story_id)
              .limit(1);

            if (!error && data && data.length > 0) {
              if (await doesStoryBelongToTopic(data[0])) {
                console.log('✅ Slide belongs to a story for this topic, refreshing...');
                
                // Debounced refresh
                if (debounceTimerRef.current) {
                  clearTimeout(debounceTimerRef.current);
                }
                debounceTimerRef.current = setTimeout(() => {
                  loadTopicContent();
                }, 300);
              }
            }
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
          console.log('🔄 Queue item change detected, checking if for this topic...', payload);
          const queueItem = (payload.new || payload.old) as any;

          if (
            await isTopicArticleForSelectedTopic(
              queueItem?.topic_article_id,
              queueItem?.shared_content_id
            )
          ) {
            console.log('✅ Queue item belongs to this topic, refreshing processing queue...');
            
            // Debounced refresh
            if (debounceTimerRef.current) {
              clearTimeout(debounceTimerRef.current);
            }
            debounceTimerRef.current = setTimeout(() => {
              loadTopicContent();
            }, 300);
          }
        }
      )
      .subscribe((status) => {
        console.log('🔄 Real-time subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
      // Clean up debounce timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    selectedTopicId,
    loadTopicContent,
    doesStoryBelongToTopic,
    isTopicArticleForSelectedTopic
  ]);

  // Fallback polling as safety net (every 30 seconds)
  useEffect(() => {
    if (!selectedTopicId) return;

    const pollInterval = setInterval(() => {
      console.log('🔄 Fallback poll refresh');
      loadTopicContent();
    }, 30000);

    return () => clearInterval(pollInterval);
  }, [selectedTopicId, loadTopicContent]);

  // Load more articles (pagination)
  const loadMoreArticles = useCallback(async () => {
    if (!selectedTopicId || loadingMore || !hasMoreArticles) return;
    
    setLoadingMore(true);
    try {
      const nextPage = articlesPage + 1;
      const offset = (nextPage - 1) * ARTICLES_PAGE_SIZE;
      
      const result = await supabase.rpc('get_topic_articles_multi_tenant', {
        p_topic_id: selectedTopicId,
        p_status: null,
        p_limit: ARTICLES_PAGE_SIZE,
        p_offset: offset
      });
      
      if (result.error) {
        console.error('Error loading more articles:', result.error);
        return;
      }
      
      // Process and append new articles
      const newArticles = (result.data || [])
        .filter((item: any) => ['new', 'processed'].includes(item.processing_status))
        .map((item: any) => ({
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
           author: item.author,
           image_url: item.image_url,
           canonical_url: item.canonical_url,
           content_checksum: item.content_checksum,
           published_at: item.published_at,
           word_count: item.word_count || 0,
           language: item.language || 'en',
          source_domain: item.source_domain,
          last_seen_at: item.last_seen_at || item.updated_at,
          is_snippet: (item.word_count || 0) > 0 && (item.word_count || 0) < 150,
          article_type: 'multi_tenant' as const
        }));
      
      // Deduplicate against existing articles
      const existingIds = new Set(articles.map(a => a.id));
      const uniqueNewArticles = newArticles.filter(a => !existingIds.has(a.id));
      
      setArticles(prev => [...prev, ...uniqueNewArticles]);
      setArticlesPage(nextPage);
      setHasMoreArticles(uniqueNewArticles.length === ARTICLES_PAGE_SIZE);
      
      console.log('📄 Loaded more articles:', {
        page: nextPage,
        newCount: uniqueNewArticles.length,
        totalNow: articles.length + uniqueNewArticles.length
      });
    } finally {
      setLoadingMore(false);
    }
  }, [selectedTopicId, articlesPage, loadingMore, hasMoreArticles, articles]);

  return {
    // Data
    articles,
    queueItems,
    stories,
    stats,
    
    // Loading states
    loading,
    loadingMore,
    
    // Pagination
    hasMoreArticles,
    totalArticlesCount,
    loadMoreArticles,
    
    // New content indicators
    newArrivals,
    newPublished,
    clearNewArrivals: () => setNewArrivals(false),
    clearNewPublished: () => setNewPublished(false),
    
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