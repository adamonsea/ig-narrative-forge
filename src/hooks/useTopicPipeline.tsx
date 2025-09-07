import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Article {
  id: string;
  title: string;
  body: string;
  source_url: string;
  published_at: string | null;
  created_at: string;
  processing_status: string;
  content_quality_score: number | null;
  regional_relevance_score: number | null;
  word_count: number | null;
  author?: string;
  summary?: string;
  import_metadata?: any;
}

interface QueueItem {
  id: string;
  article_id: string;
  status: string;
  created_at: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  article: {
    title: string;
    source_url: string;
  };
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface StoryArticle {
  id?: string;
  title: string;
  author?: string;
  source_url: string;
  region?: string;
  published_at?: string | null;
  word_count?: number | null;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
  article?: StoryArticle;
  articles?: StoryArticle;
  is_published?: boolean;
  cover_illustration_url?: string | null;
  cover_illustration_prompt?: string | null;
  illustration_generated_at?: string | null;
  content_generation_queue?: Array<{
    slidetype: string;
    tone: string;
    writing_style: string;
    audience_expertise: string;
  }>;
}

export const useTopicPipeline = (selectedTopicId: string) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState({
    pending_articles: 0,
    processing_queue: 0,
    ready_stories: 0
  });
  const { toast } = useToast();

  // Optimistically remove article from local state
  const optimisticallyRemoveArticle = (articleId: string) => {
    setArticles(prev => prev.filter(article => article.id !== articleId));
    setStats(prev => ({
      ...prev,
      pending_articles: Math.max(0, prev.pending_articles - 1)
    }));
  };

  // Auto-select slide type based on word count
  const getAutoSlideType = (wordCount: number): 'short' | 'tabloid' | 'indepth' | 'extensive' => {
    if (wordCount >= 1500) return 'extensive';
    if (wordCount >= 800) return 'indepth';
    if (wordCount >= 400) return 'tabloid';
    return 'short';
  };

  // Calculate similarity between two strings
  const calculateTitleSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    
    // Normalize strings - remove common words and punctuation
    const normalize = (str: string) => str
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\b(the|and|or|but|in|on|at|to|for|of|with|by|from|up|about|into|through|during|before|after|above|below|between|among|within|without|against|toward|upon|beneath|beside|behind|beyond|across|around|underneath|underneath|inside|outside|along|against)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    const norm1 = normalize(str1);
    const norm2 = normalize(str2);
    
    if (!norm1 || !norm2) return 0;
    
    // Calculate Jaccard similarity (intersection over union of words)
    const words1 = new Set(norm1.split(' '));
    const words2 = new Set(norm2.split(' '));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  };

  const loadTopicContent = async () => {
    if (!selectedTopicId) {
      console.log('🔍 No selectedTopicId provided, skipping load');
      return;
    }

    console.log('🔍 Loading topic content for:', selectedTopicId);
    
    try {
      setLoading(true);

      // First get topic config for keyword overlap calculation
      const { data: topicConfig } = await supabase
        .from('topics')
        .select('name, description, keywords, landmarks, postcodes, organizations')
        .eq('id', selectedTopicId)
        .single();

      // Enhanced keyword overlap calculation with topic name/description matching
      const calculateKeywordOverlap = (article: any, topicConfig: any) => {
        if (!article?.title) return { score: 0, matchedKeywords: [], topicMatches: [] };
        
        const articleText = `${article.title} ${article.body || ''}`.toLowerCase();
        const topicKeywords = topicConfig?.keywords || [];
        
        // Common words to filter out from topic matching
        const commonWords = new Set([
          'and', 'or', 'but', 'the', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 
          'by', 'from', 'up', 'about', 'into', 'through', 'during', 'before', 'after', 
          'above', 'below', 'between', 'among', 'this', 'that', 'these', 'those', 'is', 
          'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 
          'did', 'will', 'would', 'could', 'should', 'may', 'might', 'can', 'must'
        ]);
        
        // Extract words from topic name and description as additional keywords
        const topicNameWords = topicConfig?.name 
          ? topicConfig.name.toLowerCase().split(/\W+/).filter(word => 
              word.length > 2 && !commonWords.has(word)
            )
          : [];
        const topicDescWords = topicConfig?.description
          ? topicConfig.description.toLowerCase().split(/\W+/).filter(word => 
              word.length > 2 && !commonWords.has(word)
            )
          : [];
        
        let matches = 0;
        let matchedKeywords: string[] = [];
        let topicMatches: string[] = [];
        let scoreBoost = 0;
        
        // Check regular keywords
        topicKeywords.forEach((keyword: string) => {
          if (articleText.includes(keyword.toLowerCase())) {
            matches++;
            matchedKeywords.push(keyword);
          }
        });
        
        // Check topic name words with significant boost
        topicNameWords.forEach((word: string) => {
          if (articleText.includes(word)) {
            topicMatches.push(word);
            scoreBoost += 40; // Major boost for topic name matches
          }
        });
        
        // Check topic description words with moderate boost  
        topicDescWords.forEach((word: string) => {
          if (articleText.includes(word) && !topicNameWords.includes(word)) {
            topicMatches.push(word);
            scoreBoost += 20; // Moderate boost for description matches
          }
        });
        
        const baseScore = topicKeywords.length > 0 
          ? Math.round((matches / topicKeywords.length) * 100)
          : 50; // Default if no topic keywords
        
        return {
          score: Math.min(100, baseScore + scoreBoost),
          matchedKeywords,
          topicMatches
        };
      };

      // Get articles in queue or with stories to exclude them
      const { data: queueArticles } = await supabase
        .from('content_generation_queue')
        .select('article_id')
        .in('status', ['pending', 'processing', 'failed']);
        
      // Only exclude articles with ready stories, not draft ones (fix for return to review bug)
      const { data: storyArticles } = await supabase
        .from('stories')
        .select('article_id, articles!inner(title)')
        .eq('articles.topic_id', selectedTopicId)
        .eq('status', 'ready'); // Only exclude ready stories, allow draft ones to appear in pending

      // Don't exclude processed articles - they should appear when returned to review
      const excludedIds = [
        ...(queueArticles?.map(q => q.article_id) || []),
        ...(storyArticles?.map(s => s.article_id) || [])
      ];

      const storyTitles = storyArticles?.map(s => s.articles?.title?.toLowerCase().trim()) || [];

      let articlesQuery = supabase
        .from('articles')
        .select('*')
        .eq('topic_id', selectedTopicId)
        .in('processing_status', ['new', 'processed']) // Include processed articles that might have been recovered
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Only recent articles
        .order('regional_relevance_score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(100); // Increased limit to show more recovered articles

      if (excludedIds.length > 0) {
        articlesQuery = articlesQuery.not('id', 'in', `(${excludedIds.join(',')})`);
      }

      const { data: articlesData, error: articlesError } = await articlesQuery;

      // Get all draft stories for this topic to include their articles in pending
      const { data: draftStories } = await supabase
        .from('stories')
        .select('article_id, articles!inner(topic_id)')
        .eq('articles.topic_id', selectedTopicId)
        .eq('status', 'draft');

      // Include articles that were returned to review from draft stories
      const { data: returnedArticles } = await supabase
        .from('articles')
        .select('*')
        .eq('topic_id', selectedTopicId)
        .eq('processing_status', 'processed')
        .in('id', (draftStories || [])
          .map(s => s.article_id)
        );

      // Combine new articles with returned articles
      const allPendingArticles = [
        ...(articlesData || []),
        ...(returnedArticles || [])
      ];
      
      if (articlesError) throw new Error(`Failed to load articles: ${articlesError.message}`);

      // Additional filtering to remove duplicates based on title similarity and add relevance flagging
      const filteredArticles = allPendingArticles.filter(article => {
        const articleTitle = article.title?.toLowerCase().trim();
        if (!articleTitle) return true;
        
        const isDuplicate = storyTitles.some(storyTitle => {
          if (!storyTitle) return false;
          const similarity = calculateTitleSimilarity(articleTitle, storyTitle);
          return similarity > 0.9;
        });
        
        return !isDuplicate && !excludedIds.includes(article.id);
      }).map(article => {
        // Add enhanced keyword overlap scoring and low relevance flagging
        const keywordAnalysis = calculateKeywordOverlap(article, topicConfig);
        
        // Apply score boost to regional relevance score
        const boostedScore = Math.min(100, (article.regional_relevance_score || 0) + 
          (keywordAnalysis.topicMatches.length > 0 ? 30 : 0));
        
        // Use proper filtering thresholds based on topic type
        let relevanceThreshold = 25; // Default for regional topics
        if (topicConfig && topicConfig.keywords && topicConfig.keywords.length > 0) {
          // Keyword topic threshold
          relevanceThreshold = 20;
        }
        
        const isLowScore = boostedScore < relevanceThreshold;
        
        return {
          ...article,
          keyword_overlap_score: keywordAnalysis.score,
          matched_keywords: keywordAnalysis.matchedKeywords,
          topic_matches: keywordAnalysis.topicMatches,
          boosted_relevance_score: boostedScore,
          is_low_score: isLowScore
        };
      });

      // Load content generation queue for this topic
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .select(`
          *,
          articles!inner(
            title,
            source_url,
            topic_id
          )
        `)
        .eq('articles.topic_id', selectedTopicId)
        .neq('status', 'completed')
        .order('created_at', { ascending: false });

      if (queueError) throw queueError;

      // Load ready and draft stories for this topic with style choices
      const { data: storiesWithQueue, error: storiesError } = await supabase
        .from('stories')
        .select(`
          *,
          articles!inner(
            id,
            title,
            source_url,
            topic_id
          ),
          slides(
            id,
            content,
            slide_number
          )
        `)
        .eq('articles.topic_id', selectedTopicId)
        .eq('status', 'ready') // Only fetch ready stories to prevent duplicates when returning to review
        .order('updated_at', { ascending: false });

      if (storiesError) throw storiesError;

      // Get actual count of ready stories for accurate stats (without limit)
      const { count: readyStoriesCount, error: countError } = await supabase
        .from('stories')
        .select('id, articles!inner(topic_id)', { count: 'exact', head: true })
        .eq('status', 'ready')
        .eq('articles.topic_id', selectedTopicId);

      // Get style choices for each story by fetching from content_generation_queue
      const storyIds = (storiesWithQueue || []).map(story => story.article_id);
      let styleChoicesData = [];
      
      if (storyIds.length > 0) {
        const { data: queueWithStyles } = await supabase
          .from('content_generation_queue')
          .select('article_id, slidetype, tone, writing_style, audience_expertise')
          .in('article_id', storyIds)
          .eq('status', 'completed');
        
        styleChoicesData = queueWithStyles || [];
      }

      setArticles(filteredArticles || []);
      setQueueItems((queueData || []).map(item => ({
        id: item.id,
        article_id: item.article_id,
        status: item.status,
        created_at: item.created_at,
        attempts: item.attempts,
        max_attempts: item.max_attempts,
        error_message: item.error_message,
        article: {
          title: item.articles.title,
          source_url: item.articles.source_url
        }
      })));
      
      setStories((storiesWithQueue || []).map(story => {
        // Find matching style choices for this story
        const styleChoices = styleChoicesData.find(s => s.article_id === story.article_id);
        
        return {
          id: story.id,
          title: story.title,
          status: story.status,
          created_at: story.created_at,
          article_id: story.article_id || '',
          is_published: story.is_published || false,
          cover_illustration_url: story.cover_illustration_url || null,
          cover_illustration_prompt: story.cover_illustration_prompt || null,
          illustration_generated_at: story.illustration_generated_at || null,
          article: {
            id: story.articles?.id || '',
            title: story.articles.title,
            source_url: story.articles.source_url
          },
          slides: (story.slides || []).map((slide: any) => ({
            id: slide.id,
            content: slide.content,
            slide_number: slide.slide_number,
            word_count: slide.word_count || slide.content?.split(' ').length || 0,
            alt_text: slide.alt_text || null,
            visual_prompt: slide.visual_prompt || null,
            story_id: story.id
          })).sort((a: any, b: any) => a.slide_number - b.slide_number),
          content_generation_queue: styleChoices ? [styleChoices] : []
        };
      }));

      setStats({
        pending_articles: filteredArticles.length,
        processing_queue: queueData?.filter(q => q.status === 'processing').length || 0,
        ready_stories: readyStoriesCount || storiesWithQueue?.filter(s => s.status === 'ready').length || 0
      });

      console.log('📊 Topic content loaded successfully');
    } catch (error) {
      console.error('❌ Error loading topic content:', error);
      toast({
        title: "Error",
        description: "Failed to load content for this topic",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Combined useEffect for loading and real-time subscriptions to maintain hooks order
  useEffect(() => {
    if (!selectedTopicId) return;

    // Initial load
    loadTopicContent();

    // Set up real-time subscriptions
    console.log('🔄 Setting up real-time subscriptions for topic:', selectedTopicId);

    const channel = supabase
      .channel(`topic-pipeline-${selectedTopicId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        () => {
          console.log('🔄 Articles updated, refreshing pipeline');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_generation_queue'
        },
        () => {
          console.log('🔄 Queue updated, refreshing pipeline');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'stories'
        },
        (payload) => {
          console.log('🔄 Story status updated:', payload);
          // Only refresh if status changed to/from ready or draft
          const oldRecord = payload.old as any;
          const newRecord = payload.new as any;
          if (oldRecord?.status !== newRecord?.status && 
              (['ready', 'draft'].includes(oldRecord?.status) || ['ready', 'draft'].includes(newRecord?.status))) {
            loadTopicContent();
          }
        }
      )
      .subscribe();

    return () => {
      console.log('🔄 Cleaning up real-time subscriptions');
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId]);

  return {
    articles,
    queueItems,
    stories,
    loading,
    stats,
    loadTopicContent,
    getAutoSlideType,
    optimisticallyRemoveArticle,
    setArticles,
    setQueueItems,
    setStories,
    setStats
  };
};