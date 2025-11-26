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
  article_id?: string;
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
}

export const useSwipeMode = (topicId: string) => {
  const { user } = useAuth();
  const [stories, setStories] = useState<Story[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SwipeStats>({ likeCount: 0, discardCount: 0, remainingCount: 0 });

  // Fetch stories that haven't been swiped yet
  const fetchUnswipedStories = useCallback(async () => {
    if (!user || !topicId) return;

    try {
      setLoading(true);

      // First get topic_article IDs for this topic (limit to prevent query overflow)
      const topicArticlesQuery = await (supabase as any)
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicId)
        .limit(200);

      if (topicArticlesQuery.error) throw topicArticlesQuery.error;

      const topicArticleIds = (topicArticlesQuery.data || []).map((ta: any) => ta.id);
      
      if (topicArticleIds.length === 0) {
        setStories([]);
        setStats(prev => ({ ...prev, remainingCount: 0 }));
        setLoading(false);
        return;
      }

      // Get stories for these topic_articles, only with images
      const storiesQuery = await (supabase as any)
        .from('stories')
        .select('id, title, author, cover_illustration_url, created_at, article_id, topic_article_id')
        .in('topic_article_id', topicArticleIds)
        .eq('status', 'published')
        .not('cover_illustration_url', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      if (storiesQuery.error) throw storiesQuery.error;

      // Get article data for source URLs
      const articleIds = (storiesQuery.data || []).map((s: any) => s.article_id).filter(Boolean);
      const articlesQuery: any = await (supabase as any)
        .from('articles')
        .select('id, source_url, published_at')
        .in('id', articleIds);

      // Get slides data
      const storyIds = (storiesQuery.data || []).map((s: any) => s.id);
      const slidesQuery: any = await (supabase as any)
        .from('slides')
        .select('story_id, slide_number, content')
        .in('story_id', storyIds);

      // Filter out already swiped stories
      const swipesQuery: any = await (supabase as any)
        .from('story_swipes')
        .select('story_id')
        .eq('user_id', user.id)
        .eq('topic_id', topicId);

      const swipedIds = new Set((swipesQuery.data || []).map((s: any) => s.story_id));
      
      // Combine data (already filtered for images in query)
      const enrichedStories = (storiesQuery.data || [])
        .filter((s: any) => !swipedIds.has(s.id))
        .map((story: any) => {
          const article = (articlesQuery.data || []).find((a: any) => a.id === story.article_id);
          const slides = (slidesQuery.data || []).filter((s: any) => s.story_id === story.id);
          
          return {
            ...story,
            article: article ? {
              source_url: article.source_url,
              published_at: article.published_at
            } : null,
            slides
          };
        });

      setStories(enrichedStories);
      setStats(prev => ({ ...prev, remainingCount: enrichedStories.length }));
    } catch (error) {
      console.error('Error fetching stories:', error);
      toast.error('Failed to load stories');
    } finally {
      setLoading(false);
    }
  }, [user, topicId]);

  // Fetch swipe stats
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

  // Record a swipe
  const recordSwipe = useCallback(async (storyId: string, swipeType: 'like' | 'discard' | 'super_like') => {
    if (!user) {
      toast.error('Please sign in to swipe stories');
      return false;
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

      // Update stats
      setStats(prev => ({
        likeCount: swipeType === 'like' || swipeType === 'super_like' ? prev.likeCount + 1 : prev.likeCount,
        discardCount: swipeType === 'discard' ? prev.discardCount + 1 : prev.discardCount,
        remainingCount: Math.max(0, prev.remainingCount - 1)
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
      .select('id, title, author, cover_illustration_url, created_at, article_id')
      .in('id', storyIds);

    const articleIds = (storiesQuery.data || []).map((s: any) => s.article_id).filter(Boolean);
    const articlesQuery: any = await (supabase as any)
      .from('articles')
      .select('id, source_url, published_at')
      .in('id', articleIds);

    return (storiesQuery.data || []).map((story: any) => {
      const article = (articlesQuery.data || []).find((a: any) => a.id === story.article_id);
      return {
        ...story,
        article: article ? {
          source_url: article.source_url,
          published_at: article.published_at
        } : null
      };
    });
  }, [user, topicId]);

  useEffect(() => {
    fetchUnswipedStories();
    fetchStats();
  }, [fetchUnswipedStories, fetchStats]);

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
