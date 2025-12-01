import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Story {
  id: string;
  title: string;
  author: string | null;
  cover_illustration_url: string | null;
  created_at: string;
  shared_content_id?: string;
  article: {
    source_url: string;
    published_at?: string | null;
  } | null;
  slides?: Array<{
    slide_number: number;
    content: string;
    story_id?: string;
  }>;
}

interface SwipeStats {
  likeCount: number;
  discardCount: number;
  remainingCount: number;
  currentStreak: number;
  totalSwipes: number;
}

export const useSwipeMode = (topicId: string) => {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SwipeStats>({ 
    likeCount: 0, 
    discardCount: 0, 
    remainingCount: 0,
    currentStreak: 0,
    totalSwipes: 0
  });

  // Fetch stories - works for both authenticated and anonymous users
  const fetchUnswipedStories = useCallback(async () => {
    if (!topicId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // Get ALL topic_article IDs for this topic (paginated to bypass 1000 row default limit)
      let topicArticleIds: string[] = [];
      let from = 0;
      const pageSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const topicArticlesQuery = await (supabase as any)
          .from('topic_articles')
          .select('id')
          .eq('topic_id', topicId)
          .range(from, from + pageSize - 1);

        if (topicArticlesQuery.error) throw topicArticlesQuery.error;

        const pageIds = (topicArticlesQuery.data || []).map((ta: any) => ta.id);
        topicArticleIds = [...topicArticleIds, ...pageIds];
        
        hasMore = pageIds.length === pageSize;
        from += pageSize;
      }
      
      if (topicArticleIds.length === 0) {
        setStories([]);
        setStats(prev => ({ ...prev, remainingCount: 0 }));
        setLoading(false);
        return;
      }

      // Get ALL stories for these topic_articles, only with images (no limit)
      // Process in batches if needed due to PostgreSQL IN clause limits
      const batchSize = 500;
      let allStories: any[] = [];
      
      for (let i = 0; i < topicArticleIds.length; i += batchSize) {
        const batch = topicArticleIds.slice(i, i + batchSize);
        const storiesQuery = await (supabase as any)
          .from('stories')
          .select('id, title, author, cover_illustration_url, created_at, shared_content_id, topic_article_id')
          .in('topic_article_id', batch)
          .eq('status', 'published')
          .not('cover_illustration_url', 'is', null)
          .order('created_at', { ascending: false });

        if (storiesQuery.error) throw storiesQuery.error;
        allStories = [...allStories, ...(storiesQuery.data || [])];
      }

      // Get article data for source URLs from shared_article_content (batch if needed)
      const sharedContentIds = allStories.map((s: any) => s.shared_content_id).filter(Boolean);
      let allSharedContent: any[] = [];
      
      for (let i = 0; i < sharedContentIds.length; i += batchSize) {
        const batch = sharedContentIds.slice(i, i + batchSize);
        const sharedContentQuery: any = await (supabase as any)
          .from('shared_article_content')
          .select('id, url, published_at')
          .in('id', batch);
        
        if (sharedContentQuery.data) {
          allSharedContent = [...allSharedContent, ...sharedContentQuery.data];
        }
      }

      // Get slides data (batch if needed) with error handling
      const storyIds = allStories.map((s: any) => s.id);
      let allSlides: any[] = [];
      
      for (let i = 0; i < storyIds.length; i += batchSize) {
        const batch = storyIds.slice(i, i + batchSize);
        const slidesQuery: any = await (supabase as any)
          .from('slides')
          .select('story_id, slide_number, content')
          .in('story_id', batch);
        
        // Add error handling - log and continue with other batches
        if (slidesQuery.error) {
          console.error(`⚠️ Slides batch ${i}-${i + batchSize} failed:`, slidesQuery.error);
          continue;
        }
        
        if (slidesQuery.data) {
          allSlides = [...allSlides, ...slidesQuery.data];
        }
      }

      // Filter out already swiped stories (only if user is authenticated)
      let swipedIds = new Set<string>();
      if (user) {
        const swipesQuery: any = await (supabase as any)
          .from('story_swipes')
          .select('story_id')
          .eq('user_id', user.id)
          .eq('topic_id', topicId);

        swipedIds = new Set((swipesQuery.data || []).map((s: any) => s.story_id));
      }
      
      // Combine data (already filtered for images in query)
      const enrichedStories = allStories
        .filter((s: any) => !swipedIds.has(s.id))
        .map((story: any) => {
          const sharedContent = allSharedContent.find((sc: any) => sc.id === story.shared_content_id);
          const slides = allSlides.filter((s: any) => s.story_id === story.id);
          
          return {
            ...story,
            article: sharedContent ? {
              source_url: sharedContent.url,
              published_at: sharedContent.published_at
            } : null,
            slides
          };
        })
        // Filter out stories with no slides - they can't be displayed properly
        .filter((story: any) => story.slides && story.slides.length > 0);

      // Separate into recent (last 7 days) and older stories
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const getStoryDate = (story: any) => 
        story.article?.published_at ? new Date(story.article.published_at) : new Date(story.created_at);

      const recentStories = enrichedStories.filter((s: any) => getStoryDate(s) >= oneWeekAgo);
      const olderStories = enrichedStories.filter((s: any) => getStoryDate(s) < oneWeekAgo);

      // Sort recent by date (newest first)
      recentStories.sort((a: any, b: any) => getStoryDate(b).getTime() - getStoryDate(a).getTime());

      // Shuffle older stories (Fisher-Yates algorithm)
      for (let i = olderStories.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [olderStories[i], olderStories[j]] = [olderStories[j], olderStories[i]];
      }

      // Combine: recent first, then randomized older
      const finalStories = [...recentStories, ...olderStories];
      
      // Defensive logging for stories that had no slides
      const storiesWithNoSlides = allStories.filter((s: any) => 
        !swipedIds.has(s.id) && !allSlides.some((sl: any) => sl.story_id === s.id)
      );
      if (storiesWithNoSlides.length > 0) {
        console.warn(`⚠️ ${storiesWithNoSlides.length} stories filtered out (no slides):`, 
          storiesWithNoSlides.map((s: any) => s.id));
      }

      setStories(finalStories);
      setStats(prev => ({ ...prev, remainingCount: finalStories.length }));
    } catch (error) {
      console.error('Error fetching stories:', error);
      toast.error('Failed to load stories');
    } finally {
      setLoading(false);
    }
  }, [user, topicId]);

  // Fetch swipe stats (only for authenticated users)
  const fetchStats = useCallback(async () => {
    if (!user || !topicId) return;

    const swipesQuery: any = await (supabase as any)
      .from('story_swipes')
      .select('swipe_type')
      .eq('user_id', user.id)
      .eq('topic_id', topicId);

    const likeCount = (swipesQuery.data || []).filter((s: any) => s.swipe_type === 'like' || s.swipe_type === 'super_like').length;
    const discardCount = (swipesQuery.data || []).filter((s: any) => s.swipe_type === 'discard').length;

    setStats(prev => ({ ...prev, likeCount, discardCount }));
  }, [user, topicId]);

  // Record a swipe - returns true if persisted, false if anonymous
  const recordSwipe = useCallback(async (storyId: string, swipeType: 'like' | 'discard' | 'super_like') => {
    // For anonymous users, just advance locally without persisting
    if (!user) {
      setStats(prev => ({
        likeCount: swipeType === 'like' || swipeType === 'super_like' ? prev.likeCount + 1 : prev.likeCount,
        discardCount: swipeType === 'discard' ? prev.discardCount + 1 : prev.discardCount,
        remainingCount: Math.max(0, prev.remainingCount - 1),
        currentStreak: swipeType === 'like' || swipeType === 'super_like' ? prev.currentStreak + 1 : 0,
        totalSwipes: prev.totalSwipes + 1
      }));
      setCurrentIndex(prev => prev + 1);
      return false; // Indicates swipe was not persisted
    }

    try {
      const { error } = await supabase
        .from('story_swipes')
        .insert({
          user_id: user.id,
          story_id: storyId,
          topic_id: topicId,
          swipe_type: swipeType
        });

      if (error) throw error;

      // Update stats with streak tracking
      setStats(prev => ({
        likeCount: swipeType === 'like' || swipeType === 'super_like' ? prev.likeCount + 1 : prev.likeCount,
        discardCount: swipeType === 'discard' ? prev.discardCount + 1 : prev.discardCount,
        remainingCount: Math.max(0, prev.remainingCount - 1),
        currentStreak: swipeType === 'like' || swipeType === 'super_like' ? prev.currentStreak + 1 : 0,
        totalSwipes: prev.totalSwipes + 1
      }));

      // Move to next story
      setCurrentIndex(prev => prev + 1);

      return true;
    } catch (error) {
      console.error('Error recording swipe:', error);
      toast.error('Failed to save swipe');
      return false;
    }
  }, [user, topicId]);

  // Get liked stories
  const fetchLikedStories = useCallback(async () => {
    if (!user || !topicId) return [];

    const swipesQuery: any = await (supabase as any)
      .from('story_swipes')
      .select('story_id, created_at')
      .eq('user_id', user.id)
      .eq('topic_id', topicId)
      .in('swipe_type', ['like', 'super_like'])
      .order('created_at', { ascending: false });

    const storyIds = (swipesQuery.data || []).map((s: any) => s.story_id);
    
    if (storyIds.length === 0) return [];

    const storiesQuery: any = await (supabase as any)
      .from('stories')
      .select('id, title, author, cover_illustration_url, created_at, shared_content_id')
      .in('id', storyIds);

    const sharedContentIds = (storiesQuery.data || []).map((s: any) => s.shared_content_id).filter(Boolean);
    const sharedContentQuery: any = await (supabase as any)
      .from('shared_article_content')
      .select('id, url, published_at')
      .in('id', sharedContentIds);

    return (storiesQuery.data || []).map((story: any) => {
      const sharedContent = (sharedContentQuery.data || []).find((sc: any) => sc.id === story.shared_content_id);
      return {
        ...story,
        article: sharedContent ? {
          source_url: sharedContent.url,
          published_at: sharedContent.published_at
        } : null
      };
    });
  }, [user, topicId]);

  useEffect(() => {
    // Initial fetch on mount or when topicId changes
    if (topicId) {
      fetchUnswipedStories();
      fetchStats();
    }
  }, [topicId, fetchUnswipedStories, fetchStats]);

  const currentStory = stories[currentIndex] || null;
  const hasMoreStories = currentIndex < stories.length;

  // Reset all swipes for this topic
  const resetSwipes = useCallback(async () => {
    if (!user || !topicId) return;

    try {
      const { error } = await supabase
        .from('story_swipes')
        .delete()
        .eq('user_id', user.id)
        .eq('topic_id', topicId);

      if (error) throw error;

      toast.success('Swipe history cleared - reloading stories');
      setCurrentIndex(0);
      await fetchUnswipedStories();
      await fetchStats();
    } catch (error) {
      console.error('Error resetting swipes:', error);
      toast.error('Failed to reset swipes');
    }
  }, [user, topicId, fetchUnswipedStories, fetchStats]);

  return {
    currentStory,
    hasMoreStories,
    loading,
    stats,
    recordSwipe,
    fetchLikedStories,
    refetch: fetchUnswipedStories,
    resetSwipes,
    stories,
    currentIndex
  };
};
