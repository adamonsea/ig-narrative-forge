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
    if (!topicId || topicId.trim() === '') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      // PARALLEL FETCH: Get stories and user swipes simultaneously
      // This eliminates sequential waiting - major performance improvement
      
      const [storiesResult, swipesResult] = await Promise.all([
        // Fetch published stories with images for this topic (single query with join)
        supabase
          .from('stories')
          .select(`
            id, title, author, cover_illustration_url, created_at, shared_content_id, topic_article_id,
            topic_articles!inner(topic_id),
            shared_article_content:shared_content_id(id, url, published_at)
          `)
          .eq('topic_articles.topic_id', topicId)
          .eq('status', 'published')
          .not('cover_illustration_url', 'is', null)
          .order('created_at', { ascending: false })
          .limit(500),
        
        // Fetch user's swipes for this topic (if authenticated)
        user 
          ? supabase
              .from('story_swipes')
              .select('story_id')
              .eq('user_id', user.id)
              .eq('topic_id', topicId)
          : Promise.resolve({ data: [], error: null })
      ]);

      if (storiesResult.error) throw storiesResult.error;
      
      const allStories = storiesResult.data || [];
      const swipedIds = new Set((swipesResult.data || []).map((s: any) => s.story_id));

      // Filter out already swiped stories
      const unswipedStories = allStories.filter((s: any) => !swipedIds.has(s.id));
      
      if (unswipedStories.length === 0) {
        setStories([]);
        setStats(prev => ({ ...prev, remainingCount: 0 }));
        setLoading(false);
        return;
      }

      // Fetch slides for unswiped stories only (smaller payload)
      const storyIds = unswipedStories.map((s: any) => s.id);
      const slidesResult = await supabase
        .from('slides')
        .select('story_id, slide_number, content')
        .in('story_id', storyIds)
        .order('slide_number', { ascending: true });

      const allSlides = slidesResult.data || [];
      
      // Combine data
      const enrichedStories = unswipedStories
        .map((story: any) => {
          const sharedContent = story.shared_article_content;
          const slides = allSlides.filter((s: any) => s.story_id === story.id);
          
          return {
            id: story.id,
            title: story.title,
            author: story.author,
            cover_illustration_url: story.cover_illustration_url,
            created_at: story.created_at,
            shared_content_id: story.shared_content_id,
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
