import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
  PlayCircle, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  BarChart3, 
  ExternalLink, 
  Sparkles, 
  XCircle, 
  RefreshCw, 
  Eye, 
  Edit, 
  EyeOff, 
  Loader2,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Edit3,
  Trash2,
  Link
} from "lucide-react";
import { CarouselGenerationButton } from "./CarouselGenerationButton";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
}

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
  article_id: string; // Add this field to track the article ID
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
}

interface TopicAwareContentPipelineProps {
  selectedTopicId?: string; // Pre-selected topic ID from dashboard context
}

export const TopicAwareContentPipeline: React.FC<TopicAwareContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [articles, setArticles] = useState<Article[]>([]);
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingArticle, setProcessingArticle] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<'openai' | 'deepseek'>('deepseek');
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [editingStory, setEditingStory] = useState<Story | null>(null);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editingSlideContent, setEditingSlideContent] = useState('');
  const [editingSlideId, setEditingSlideId] = useState('');
  const [processingStories, setProcessingStories] = useState<Set<string>>(new Set());
  const [publishingStories, setPublishingStories] = useState<Set<string>>(new Set());
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());
  const [deletingQueueItems, setDeletingQueueItems] = useState<Set<string>>(new Set());
  const [deletingArticles, setDeletingArticles] = useState<Set<string>>(new Set());
  const [slideQuantities, setSlideQuantities] = useState<{ [key: string]: 'short' | 'tabloid' | 'indepth' }>({});
  const [stats, setStats] = useState({
    pending_articles: 0,
    processing_queue: 0,
    ready_stories: 0
  });
  const [isResettingStalled, setIsResettingStalled] = useState(false);
  const [isResettingStuck, setIsResettingStuck] = useState(false);
  const [minRelevanceScore, setMinRelevanceScore] = useState(0); // Filtering control
  const { toast } = useToast();
  const { user } = useAuth();

  // Update selectedTopicId if propTopicId changes
  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  useEffect(() => {
    loadTopics();
  }, []);

  useEffect(() => {
    if (selectedTopicId) {
      loadTopicContent();
      
      // Set up real-time subscriptions for live updates
      const queueChannel = supabase
        .channel('queue-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'content_generation_queue'
          },
          (payload) => {
            console.log('🔄 Queue change detected:', payload);
            handleQueueChange(payload);
          }
        )
        .subscribe();

      const storiesChannel = supabase
        .channel('stories-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public', 
            table: 'stories'
          },
          (payload) => {
            console.log('📚 Story change detected:', payload);
            handleStoryChange(payload);
          }
        )
        .subscribe();

      const articlesChannel = supabase
        .channel('articles-updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'articles'
          },
          (payload) => {
            console.log('📰 Article update detected:', payload);
            handleArticleChange(payload);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(queueChannel);
        supabase.removeChannel(storiesChannel);
        supabase.removeChannel(articlesChannel);
      };
    }
  }, [selectedTopicId]);
  
  // Real-time event handlers
  const handleQueueChange = async (payload: any) => {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    if (eventType === 'INSERT' && newRecord) {
      // Article added to queue - remove from articles list, add to queue
      if (newRecord.article_id) {
        setArticles(prev => prev.filter(a => a.id !== newRecord.article_id));
        
        // Fetch full queue item with article details
        const { data: queueWithArticle } = await supabase
          .from('content_generation_queue')
          .select(`*, articles!inner(title, source_url)`)
          .eq('id', newRecord.id)
          .single();
          
        if (queueWithArticle) {
          setQueueItems(prev => {
            const exists = prev.find(q => q.id === queueWithArticle.id);
            if (!exists) {
              return [...prev, {
                id: queueWithArticle.id,
                article_id: queueWithArticle.article_id,
                status: queueWithArticle.status,
                created_at: queueWithArticle.created_at,
                attempts: queueWithArticle.attempts,
                max_attempts: queueWithArticle.max_attempts,
                error_message: queueWithArticle.error_message,
                article: {
                  title: queueWithArticle.articles.title,
                  source_url: queueWithArticle.articles.source_url
                }
              }];
            }
            return prev;
          });
          
          setStats(prev => ({
            ...prev,
            pending_articles: prev.pending_articles - 1,
            processing_queue: prev.processing_queue + 1
          }));
        }
      }
    }
    
    if (eventType === 'UPDATE' && newRecord) {
      // Update queue item status
      setQueueItems(prev => prev.map(item => 
        item.id === newRecord.id 
          ? { ...item, status: newRecord.status, attempts: newRecord.attempts, error_message: newRecord.error_message }
          : item
      ));
    }
    
    if (eventType === 'DELETE' && oldRecord) {
      // Remove completed queue item
      setQueueItems(prev => prev.filter(q => q.id !== oldRecord.id));
      setStats(prev => ({
        ...prev,
        processing_queue: Math.max(0, prev.processing_queue - 1)
      }));
    }
  };

  const handleStoryChange = async (payload: any) => {
    const { eventType, new: newRecord } = payload;
    
    if (eventType === 'INSERT' && newRecord) {
      // Check if the new story belongs to the current topic
      const { data: storyWithTopic } = await supabase
        .from('stories')
        .select(`*, articles!inner(id, title, source_url, author, region, published_at, word_count, topic_id), slides(*)`)
        .eq('id', newRecord.id)
        .eq('articles.topic_id', selectedTopicId)
        .single();
        
      if (storyWithTopic) {
        // Remove the article from pending articles since it now has a story
        setArticles(prev => prev.filter(a => a.id !== storyWithTopic.articles.id));
        
        // Remove from queue items since story is complete
        setQueueItems(prev => prev.filter(q => q.article_id !== storyWithTopic.articles.id));
        
        // Add to stories
        setStories(prev => {
          const exists = prev.find(s => s.id === storyWithTopic.id);
          if (!exists) {
            return [...prev, {
              ...storyWithTopic,
              article: storyWithTopic.articles
            }];
          }
          return prev;
        });
        
        setStats(prev => ({
          ...prev,
          ready_stories: prev.ready_stories + 1
        }));
      }
    }
    
    if (eventType === 'UPDATE' && newRecord) {
      // Handle publication status changes properly
      const existingStory = stories.find(s => s.id === newRecord.id);
      
      if (existingStory) {
        // Story exists in our list
        if (newRecord.is_published === false) {
          // Story was unpublished - remove from list
          setStories(prev => prev.filter(s => s.id !== newRecord.id));
          setStats(prev => ({
            ...prev,
            ready_stories: Math.max(0, prev.ready_stories - 1)
          }));
        } else {
          // Story is still published - update it
          setStories(prev => prev.map(story => 
            story.id === newRecord.id 
              ? { ...story, ...newRecord }
              : story
          ));
        }
      } else {
        // Story not in our list - check if it should be added (published story)
        if (newRecord.is_published === true) {
          // Fetch the full story data and add it if it belongs to current topic
          const fetchAndAddStory = async () => {
            const { data: storyWithTopic } = await supabase
              .from('stories')
              .select(`*, articles!inner(id, title, source_url, author, region, published_at, word_count, topic_id), slides(*)`)
              .eq('id', newRecord.id)
              .eq('articles.topic_id', selectedTopicId)
              .single();
              
            if (storyWithTopic) {
              setStories(prev => [...prev, {
                ...storyWithTopic,
                article: storyWithTopic.articles
              }]);
              setStats(prev => ({
                ...prev,
                ready_stories: prev.ready_stories + 1
              }));
            }
          };
          fetchAndAddStory();
        }
      }
    }
    
    if (eventType === 'DELETE' && payload.old) {
      // Remove deleted story if it was in our current list
      setStories(prev => {
        const wasInList = prev.some(s => s.id === payload.old.id);
        if (wasInList) {
          setStats(prevStats => ({
            ...prevStats,
            ready_stories: Math.max(0, prevStats.ready_stories - 1)
          }));
        }
        return prev.filter(s => s.id !== payload.old.id);
      });
    }
  };

  const handleArticleChange = (payload: any) => {
    const { eventType, new: newRecord } = payload;
    
    if (eventType === 'UPDATE' && newRecord) {
      // Update article in the list
      setArticles(prev => prev.map(article => 
        article.id === newRecord.id 
          ? { ...article, ...newRecord }
          : article
      ));
    }
  };

  const loadTopics = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, topic_type, is_active')
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      setTopics((data || []).map(topic => ({
        ...topic,
        topic_type: topic.topic_type as 'regional' | 'keyword'
      })));

      if (data && data.length > 0 && !selectedTopicId && !propTopicId) {
        setSelectedTopicId(data[0].id);
      }
    } catch (error) {
      console.error('Error loading topics:', error);
      toast({
        title: "Error",
        description: "Failed to load topics",
        variant: "destructive"
      });
    }
  };

      // Smart refresh for specific parts of the UI
  const refreshQueueAndStories = async () => {
    if (!selectedTopicId) return;

    try {
      // Only refresh queue and stories, not articles (they change less frequently)
      const [queueRes, storiesRes, storiesCountRes] = await Promise.all([
        supabase
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
          .order('created_at', { ascending: false }),
        
        supabase
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
          .in('status', ['ready', 'draft'])
          .order('created_at', { ascending: false })
          .limit(50), // Increase limit to show more stories

        // Get actual count of ready stories for accurate counter
        supabase
          .from('stories')
          .select('id, articles!inner(topic_id)', { count: 'exact' })
          .eq('articles.topic_id', selectedTopicId)
          .in('status', ['ready', 'draft'])
      ]);

      if (queueRes.error) throw queueRes.error;
      if (storiesRes.error) throw storiesRes.error;
      if (storiesCountRes.error) throw storiesCountRes.error;

      setQueueItems((queueRes.data || []).map(item => ({
        id: item.id,
        article_id: item.article_id, // Add the missing article_id field
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

      setStories((storiesRes.data || []).map(story => ({
        id: story.id,
        title: story.title,
        status: story.status,
        created_at: story.created_at,
        article_id: story.article_id || '',
        is_published: story.is_published || false,
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
        })).sort((a: any, b: any) => a.slide_number - b.slide_number)
      })));

      // Update stats with accurate counts
      setStats(prev => ({
        ...prev,
        processing_queue: queueRes.data?.filter(q => q.status === 'processing').length || 0,
        ready_stories: storiesCountRes.count || 0 // Use actual count, not limited results
      }));

    } catch (error) {
      console.error('Error refreshing queue and stories:', error);
    }
  };

  // Simplified refresh for specific article status (now that we have real-time)
  const refreshArticleStatus = async (articleId: string) => {
    // With real-time subscriptions, we don't need complex refresh logic
    // The UI will update automatically when changes occur
    console.log(`🔄 Article ${articleId} status will update via real-time subscription`);
  };
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

  // Cleanup function to remove duplicate articles
  const cleanupDuplicateArticles = async () => {
    if (!selectedTopicId) return;
    
    try {
      console.log('🧹 Starting duplicate cleanup...');
      
      // Find articles that have stories but are still marked as 'new'
      const { data: duplicateArticles } = await supabase
        .from('articles')
        .select(`
          id,
          title,
          processing_status,
          stories!inner(id, status)
        `)
        .eq('topic_id', selectedTopicId)
        .eq('processing_status', 'new')
        .in('stories.status', ['ready', 'draft']);
        
      if (duplicateArticles && duplicateArticles.length > 0) {
        console.log(`🧹 Found ${duplicateArticles.length} articles with stories that should be marked processed`);
        
        // Update these articles to 'processed' status
        const { error: updateError } = await supabase
          .from('articles')
          .update({ processing_status: 'processed' })
          .in('id', duplicateArticles.map(a => a.id));
          
        if (updateError) {
          console.error('Failed to update duplicate articles:', updateError);
        } else {
          console.log('✅ Updated duplicate articles status to processed');
          
          toast({
            title: "Cleanup Complete",
            description: `Fixed ${duplicateArticles.length} duplicate articles`,
          });
          
          // Refresh the data
          loadTopicContent();
        }
      } else {
        toast({
          title: "No Duplicates Found",
          description: "All articles are properly organized",
        });
      }
    } catch (error) {
      console.error('Cleanup failed:', error);
      toast({
        title: "Cleanup Failed",
        description: "Unable to clean up duplicate articles",
        variant: "destructive"
      });
    }
  };

  const loadTopicContent = async () => {
    if (!selectedTopicId) return;

    console.log('🔍 Loading topic content for:', selectedTopicId);
    
    try {
      setLoading(true);

      // Load pending articles for this topic (exclude articles already in queue or with stories)
      // First get articles in queue or with stories to exclude them
      console.log('📊 Getting queue articles...');
      const { data: queueArticles } = await supabase
        .from('content_generation_queue')
        .select('article_id')
        .in('status', ['pending', 'processing', 'failed']); // More explicit status filtering
      
      console.log('📊 Queue articles:', queueArticles);
        
      console.log('📊 Getting story articles...');
      const { data: storyArticles } = await supabase
        .from('stories')
        .select('article_id, articles!inner(title)')
        .eq('articles.topic_id', selectedTopicId);
      
      console.log('📊 Story articles:', storyArticles);

      // Get processed articles to exclude duplicates
      console.log('📊 Getting processed articles...');
      const { data: processedArticles } = await supabase
        .from('articles')
        .select('id, title')
        .eq('topic_id', selectedTopicId)
        .eq('processing_status', 'processed');
      
      console.log('📊 Processed articles:', processedArticles);
        
      const excludedIds = [
        ...(queueArticles?.map(q => q.article_id) || []),
        ...(storyArticles?.map(s => s.article_id) || []),
        ...(processedArticles?.map(p => p.id) || []) // Exclude all processed articles
      ];

      // Also exclude articles with titles similar to existing stories (to handle duplicates)
      const storyTitles = storyArticles?.map(s => s.articles?.title?.toLowerCase().trim()) || [];
      
      console.log('📊 Excluded IDs:', excludedIds);

      let articlesQuery = supabase
        .from('articles')
        .select('*')
        .eq('topic_id', selectedTopicId)
        .eq('processing_status', 'new')
        .order('regional_relevance_score', { ascending: false }) // Sort by relevance score first
        .order('created_at', { ascending: false }) // Then by recency
        .limit(50); // Increased limit to show more articles

      // Only add exclusion if there are IDs to exclude
      if (excludedIds.length > 0) {
        console.log('📊 Adding exclusion filter for IDs:', excludedIds);
        articlesQuery = articlesQuery.not('id', 'in', `(${excludedIds.join(',')})`);
      }

      console.log('📊 Executing articles query...');
      const { data: articlesData, error: articlesError } = await articlesQuery;
      
      console.log('📊 Raw articles query result:', { articlesData, articlesError });
      
      if (articlesError) {
        console.error('❌ Articles query error:', articlesError);
        throw new Error(`Failed to load articles: ${articlesError.message}`);
      }

      // Additional filtering to remove duplicates based on title similarity
      const filteredArticles = (articlesData || []).filter(article => {
        const articleTitle = article.title?.toLowerCase().trim();
        if (!articleTitle) return true;
        
        // Check if title is too similar to any existing story
        const isDuplicate = storyTitles.some(storyTitle => {
          if (!storyTitle) return false;
          // Consistent with database - 90% threshold for duplicate detection
          const similarity = calculateTitleSimilarity(articleTitle, storyTitle);
          console.log(`📊 Similarity check: "${articleTitle}" vs "${storyTitle}" = ${similarity.toFixed(3)}`);
          return similarity > 0.9;
        });
        
        return !isDuplicate && !excludedIds.includes(article.id);
      });
      
      console.log('📊 Filtered articles count:', filteredArticles.length);
      console.log('📊 Removed duplicates:', (articlesData?.length || 0) - filteredArticles.length);

      if (articlesError) throw articlesError;

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

      // Load ready stories for this topic with accurate count
      const [storiesData, storiesCount] = await Promise.all([
        supabase
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
          .in('status', ['ready', 'draft'])
          .order('created_at', { ascending: false })
          .limit(50), // Increased limit

        supabase
          .from('stories')
          .select('id, articles!inner(topic_id)', { count: 'exact' })
          .eq('articles.topic_id', selectedTopicId)
          .in('status', ['ready', 'draft'])
      ]);

      if (storiesData.error) throw storiesData.error;
      if (storiesCount.error) throw storiesCount.error;

      setArticles(filteredArticles || []);
      setQueueItems((queueData || []).map(item => ({
        id: item.id,
        article_id: item.article_id, // Preserve the article_id field
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
      setStories((storiesData.data || []).map(story => ({
        id: story.id,
        title: story.title,
        status: story.status,
        created_at: story.created_at,
        article_id: story.article_id || '',
        is_published: story.is_published || false,
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
        })).sort((a: any, b: any) => a.slide_number - b.slide_number)
      })));

      // Update stats with accurate counts - use filtered count for pending articles
      setStats({
        pending_articles: filteredArticles.length, // Show actual displayed count
        processing_queue: queueData?.filter(q => q.status === 'processing').length || 0,
        ready_stories: storiesCount.count || 0 // Use actual count
      });

    } catch (error) {
      console.error('Error loading topic content:', error);
      toast({
        title: "Error",
        description: "Failed to load content for this topic",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const approveArticle = async (articleId: string, slideType: 'short' | 'tabloid' | 'indepth' = 'tabloid') => {
    try {
      setProcessingArticle(articleId);
      
      // Check for ALL existing queue entries for this article (not just one)
      const { data: existingQueueEntries, error: checkError } = await supabase
        .from('content_generation_queue')
        .select('id, status')
        .eq('article_id', articleId)
        .order('created_at', { ascending: false });

      if (checkError) {
        throw new Error(`Failed to check queue: ${checkError.message}`);
      }

      console.log(`🔍 Found ${existingQueueEntries?.length || 0} existing queue entries for article ${articleId}`);

      // Check if there's an active entry
      const activeEntry = existingQueueEntries?.find(entry => ['pending', 'processing'].includes(entry.status));
      if (activeEntry) {
        toast({
          title: "Already Processing",
          description: "This article is already in the processing queue",
          variant: "destructive"
        });
        return;
      }

      // Delete ALL existing entries to avoid constraint issues
      if (existingQueueEntries && existingQueueEntries.length > 0) {
        console.log(`🗑️ Removing ${existingQueueEntries.length} old queue entries`);
        const { error: deleteError } = await supabase
          .from('content_generation_queue')
          .delete()
          .eq('article_id', articleId);
          
        if (deleteError) {
          console.error('Failed to delete old queue entries:', deleteError);
          // Don't throw - let the constraint handle duplicates
        }
      }

      // Update article status to processed first
      const { error: updateError } = await supabase
        .from('articles')
        .update({ processing_status: 'processed' })
        .eq('id', articleId);

      if (updateError) throw new Error(`Failed to update article status: ${updateError.message}`);

      // Try to insert with upsert logic to handle race conditions
      const { data: queueJob, error: queueError } = await supabase
        .from('content_generation_queue')
        .insert({
          article_id: articleId,
          slidetype: slideType,
          ai_provider: selectedProvider,
          status: 'pending'
        })
        .select()
        .single();

      if (queueError) {
        // If it's a duplicate key constraint, handle gracefully
        if (queueError.code === '23505' && queueError.message.includes('idx_content_queue_unique_article_pending')) {
          console.warn('⚠️ Duplicate queue entry detected, checking if article is already processing...');
          
          // Re-check for active entries
          const { data: recheckQueue } = await supabase
            .from('content_generation_queue')
            .select('id, status')
            .eq('article_id', articleId)
            .in('status', ['pending', 'processing'])
            .limit(1)
            .maybeSingle();
            
          if (recheckQueue) {
            toast({
              title: "Already Processing",
              description: "This article is already in the processing queue",
              variant: "destructive"
            });
            return;
          }
        }
        
        throw new Error(`Failed to queue job: ${queueError.message}`);
      }

      const typeLabels = {
        short: 'Short Carousel',
        tabloid: 'Tabloid Style',
        indepth: 'In-Depth Analysis'
      };

      const providerLabels = {
        openai: 'OpenAI',
        deepseek: 'DeepSeek'
      };

      toast({
        title: "Success",
        description: `${typeLabels[slideType]} generation with ${providerLabels[selectedProvider]} queued for processing`
      });

      // Refresh specific article data instead of all topic content
      refreshArticleStatus(articleId);
    } catch (error) {
      console.error('Error approving article:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to approve article",
        variant: "destructive"
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const handleExtractContent = async (article: Article) => {
    try {
      setProcessingArticle(article.id);
      
      const { data, error } = await supabase.functions.invoke('content-extractor', {
        body: { 
          articleId: article.id,
          sourceUrl: article.source_url 
        }
      });

      if (error) throw error;

      if (data?.success) {
        const wordCountChange = data.wordCount ? ` (${data.wordCount} words)` : '';
        
        toast({
          title: 'Content Extracted Successfully',
          description: `Extracted${wordCountChange} using ${data.extractionMethod || 'direct'} method.`,
        });
        
        loadTopicContent();
      } else {
        throw new Error(data?.error || 'Content extraction failed');
      }
    } catch (error: any) {
      console.error('Content extraction error:', error);
      toast({
        title: 'Extraction Failed',
        description: error.message || 'Failed to extract article content',
        variant: 'destructive',
      });
    } finally {
      setProcessingArticle(null);
    }
  };

  const deleteArticle = async (articleId: string) => {
    try {
      setDeletingArticles(prev => new Set(prev).add(articleId));
      
      const { error } = await supabase
        .from('articles')
        .delete()
        .eq('id', articleId);

      if (error) throw error;

      // Remove from local state
      setArticles(prev => prev.filter(a => a.id !== articleId));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        pending_articles: prev.pending_articles - 1
      }));

      toast({
        title: "Article Deleted",
        description: "Article has been permanently removed"
      });
      
    } catch (error) {
      console.error('Error deleting article:', error);
      toast({
        title: "Delete Failed",
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

  const toggleStoryPublication = async (storyId: string, currentStatus: boolean) => {
    if (publishingStories.has(storyId)) return;
    
    setPublishingStories(prev => new Set(prev.add(storyId)));
    
    try {
      const { error } = await supabase
        .from('stories')
        .update({ is_published: !currentStatus })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: "Success",
        description: `Story ${!currentStatus ? 'published' : 'unpublished'} successfully`
      });

      loadTopicContent();
    } catch (error) {
      console.error('Error updating story publication status:', error);
      toast({
        title: "Error",
        description: "Failed to update publication status",
        variant: "destructive"
      });
    } finally {
      setPublishingStories(prev => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
      });
    }
  };

  const saveSlideEdit = async () => {
    if (!editingSlideId || !editingSlideContent.trim()) return;

    try {
      const { error } = await supabase
        .from('slides')
        .update({ content: editingSlideContent.trim() })
        .eq('id', editingSlideId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Slide content updated successfully"
      });

      setEditingSlide(null);
      setEditingSlideContent('');
      setEditingSlideId('');
      loadTopicContent();
    } catch (error) {
      console.error('Error updating slide:', error);
      toast({
        title: "Error",
        description: "Failed to update slide content",
        variant: "destructive"
      });
    }
  };

  const reprocessQueueItem = async (queueId: string) => {
    try {
      const { error } = await supabase
        .from('content_generation_queue')
        .update({ 
          status: 'pending',
          attempts: 0,
          error_message: null
        })
        .eq('id', queueId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Queue item reset for reprocessing"
      });

      loadTopicContent();
    } catch (error) {
      console.error('Error reprocessing queue item:', error);
      toast({
        title: "Error",
        description: "Failed to reprocess queue item",
        variant: "destructive"
      });
    }
  };

  const handleRestalledProcessing = async () => {
    setIsResettingStalled(true);
    try {
      const { error } = await supabase.rpc('reset_stalled_processing');
      if (error) throw error;
      
      toast({
        title: "Processing Reset",
        description: "Stalled processing jobs have been reset"
      });
      
      loadTopicContent();
    } catch (error: any) {
      toast({
        title: "Reset Failed", 
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setIsResettingStalled(false);
    }
  };

  const resetStuckProcessing = async () => {
    setIsResettingStuck(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-stuck-processing');

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Processing Reset",
          description: data.message || "Reset stuck processing jobs",
        });
        loadTopicContent();
      } else {
        throw new Error(data.error || 'Reset failed');
      }
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsResettingStuck(false);
    }
  };

  const handleReturnToReview = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'draft' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Story Returned to Review',
        description: 'Story status changed to draft for re-review',
      });

      loadTopicContent();
    } catch (error) {
      console.error('Failed to return story:', error);
      toast({
        title: 'Error',
        description: 'Failed to return story to review',
        variant: 'destructive',
      });
    }
  };

  const handleReturnToQueue = async (articleId: string) => {
    try {
      const { error } = await supabase
        .from('articles')
        .update({ processing_status: 'new' })
        .eq('id', articleId);

      if (error) throw error;

      toast({
        title: 'Article Returned',
        description: 'Article returned to queue for reprocessing',
      });

      loadTopicContent();
    } catch (error) {
      console.error('Failed to return article:', error);
      toast({
        title: 'Error',
        description: 'Failed to return article to queue',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteStory = async (storyId: string, storyTitle: string) => {
    if (deletingStories.has(storyId)) return;
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${storyTitle}"? This will permanently remove the story, its slides, visuals, and reset the article status.`)) {
      return;
    }
    
    setDeletingStories(prev => new Set(prev.add(storyId)));
    
    try {
      const { data, error } = await supabase.rpc('delete_story_cascade', {
        p_story_id: storyId
      });

      if (error) throw error;
      
      const result = data as { success: boolean; error?: string };
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete story');
      }

      toast({
        title: 'Story Deleted',
        description: `Story deleted successfully. Article reset to new status.`,
      });

      // Remove from local state and refresh
      setStories(prev => prev.filter(story => story.id !== storyId));
      
      // Force refresh to update counters
      loadTopicContent();
    } catch (error) {
      console.error('Error deleting story:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete story. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingStories(prev => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
      });
    }
  };

  const handleDeleteQueueItem = async (queueItemId: string, articleTitle: string) => {
    if (deletingQueueItems.has(queueItemId)) return;
    
    // Confirm deletion
    if (!confirm(`Are you sure you want to delete "${articleTitle}" from the processing queue? This will reset the article back to pending status.`)) {
      return;
    }
    
    setDeletingQueueItems(prev => new Set(prev.add(queueItemId)));
    
    try {
      // Get the article_id from the queue item first
      const { data: queueItem, error: fetchError } = await supabase
        .from('content_generation_queue')
        .select('article_id')
        .eq('id', queueItemId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the queue item
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', queueItemId);

      if (deleteError) throw deleteError;

      // Reset the article processing status to 'new'
      const { error: updateError } = await supabase
        .from('articles')
        .update({ processing_status: 'new' })
        .eq('id', queueItem.article_id);

      if (updateError) throw updateError;

      toast({
        title: 'Queue Item Deleted',
        description: 'Article removed from queue and reset to pending status.',
      });

      // Remove from local state and refresh
      setQueueItems(prev => prev.filter(item => item.id !== queueItemId));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        processing_queue: prev.processing_queue - 1,
        pending_articles: prev.pending_articles + 1
      }));
      
      // Force refresh to get updated data
      loadTopicContent();
    } catch (error) {
      console.error('Error deleting queue item:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete queue item. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setDeletingQueueItems(prev => {
        const next = new Set(prev);
        next.delete(queueItemId);
        return next;
      });
    }
  };

  const toggleStoryExpanded = (storyId: string) => {
    const newExpanded = new Set(expandedStories);
    if (newExpanded.has(storyId)) {
      newExpanded.delete(storyId);
    } else {
      newExpanded.add(storyId);
    }
    setExpandedStories(newExpanded);
  };

  const getWordCountBadge = (wordCount: number) => {
    if (wordCount <= 15) return <Badge variant="default" className="text-xs">Hook</Badge>;
    if (wordCount <= 30) return <Badge variant="secondary" className="text-xs">Body</Badge>;
    return <Badge variant="outline" className="text-xs">Long</Badge>;
  };

  const getWordCountColor = (wordCount: number, slideNumber: number) => {
    const maxWords = slideNumber === 1 ? 15 : slideNumber <= 3 ? 25 : slideNumber <= 6 ? 35 : 40;
    if (wordCount <= maxWords) return 'text-green-600';
    if (wordCount <= maxWords + 5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const currentTopic = topics.find(t => t.id === selectedTopicId);

  return (
    <div className="space-y-6">
      {/* Topic Selection & Stats */}
      <Card>
        <CardHeader>
          <CardTitle>Content Pipeline</CardTitle>
          <CardDescription>
            Manage content processing pipeline for your topics
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="pipeline-topic-select">Select Topic</Label>
              {propTopicId ? (
                // Read-only display when called from TopicDashboard
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-md">
                  <Badge variant={currentTopic?.topic_type === 'regional' ? 'default' : 'secondary'}>
                    {currentTopic?.topic_type}
                  </Badge>
                  <span className="font-medium">
                    {currentTopic?.name || 'Loading...'}
                  </span>
                  <Badge variant="outline">Topic-specific</Badge>
                </div>
              ) : (
                // Dropdown selector when used standalone
                <Select value={selectedTopicId} onValueChange={setSelectedTopicId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a topic to view pipeline" />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((topic) => (
                      <SelectItem key={topic.id} value={topic.id}>
                        <div className="flex items-center gap-2">
                          <Badge variant={topic.topic_type === 'regional' ? 'default' : 'secondary'}>
                            {topic.topic_type}
                          </Badge>
                          {topic.name}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="ai-provider-select">AI Provider</Label>
              <Select value={selectedProvider} onValueChange={(value: 'openai' | 'deepseek') => setSelectedProvider(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose AI provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      DeepSeek
                    </div>
                  </SelectItem>
                  <SelectItem value="openai">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      OpenAI
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {currentTopic && (
            <div className="grid grid-cols-3 gap-4 mt-4">
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{stats.pending_articles}</div>
                <div className="text-sm text-muted-foreground">Pending Articles</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-yellow-600">{stats.processing_queue}</div>
                <div className="text-sm text-muted-foreground">Processing Queue</div>
              </div>
              <div className="text-center p-4 border rounded-lg">
                <div className="text-2xl font-bold text-green-600">{stats.ready_stories}</div>
                <div className="text-sm text-muted-foreground">Ready Stories</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pipeline Content */}
      {selectedTopicId && (
        <Tabs defaultValue="articles" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="articles">
              Pending Articles ({stats.pending_articles})
            </TabsTrigger>
            <TabsTrigger value="queue">
              Processing Queue ({queueItems.length})
            </TabsTrigger>
            <TabsTrigger value="stories">
              Ready Stories ({stats.ready_stories})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="articles" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Pending Articles - {currentTopic?.name}</CardTitle>
                <CardDescription className="flex items-center justify-between">
                  <span>Articles waiting for approval, sorted by relevance score (highest first)</span>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={cleanupDuplicateArticles}
                    className="ml-4"
                  >
                    🧹 Cleanup Duplicates
                  </Button>
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filtering Controls */}
                <div className="mb-6 p-4 border rounded-lg bg-muted/30">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <Label htmlFor="min-score-filter">Minimum Relevance Score: {minRelevanceScore}%</Label>
                      <input
                        id="min-score-filter"
                        type="range"
                        min="0"
                        max="100"
                        step="5"
                        value={minRelevanceScore}
                        onChange={(e) => setMinRelevanceScore(Number(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer mt-2"
                      />
                      <div className="flex justify-between text-xs text-muted-foreground mt-1">
                        <span>0%</span>
                        <span>Show articles with {minRelevanceScore}%+ relevance</span>
                        <span>100%</span>
                      </div>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Showing {articles.filter(a => (a.regional_relevance_score || 0) >= minRelevanceScore).length} of {articles.length} articles
                    </div>
                  </div>
                </div>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : articles.filter(a => (a.regional_relevance_score || 0) >= minRelevanceScore).length > 0 ? (
                   <div className="space-y-3">
                      {articles
                        .filter(a => (a.regional_relevance_score || 0) >= minRelevanceScore)
                        .map((article) => (
                        <div key={article.id} className="border rounded-lg">
                          <div className="p-4">
                             <div className="flex items-start justify-between mb-3">
                               <div className="flex-1">
                                 <div className="flex items-center gap-3 mb-2">
                                   <h3 className="font-bold text-2xl text-primary leading-tight flex-1">{article.title}</h3>
                                   {/* VOLUME-FIRST: Relevance Score Badge */}
                                   <div className="flex items-center gap-2">
                                     <Badge 
                                       variant={
                                         (article.regional_relevance_score || 0) >= 70 ? "default" :
                                         (article.regional_relevance_score || 0) >= 40 ? "secondary" : "outline"
                                       }
                                       className="text-sm font-semibold"
                                     >
                                       {article.regional_relevance_score || 0}% relevance
                                     </Badge>
                                     {article.import_metadata?.topic_relevance?.details?.keyword_matches && (
                                       <Badge variant="outline" className="text-xs">
                                         {article.import_metadata.topic_relevance.details.keyword_matches.length} keywords
                                       </Badge>
                                     )}
                                   </div>
                                 </div>
                                 <div className="flex items-center gap-4 text-sm text-muted-foreground mb-3">
                                   <span className="font-medium">{article.author || 'Unknown Author'}</span>
                                   <span>•</span>
                                   <span>{new Date(article.created_at).toLocaleDateString()}</span>
                                   <span>•</span>
                                   <span className="font-medium">{article.word_count || 0} words</span>
                                   {article.content_quality_score && (
                                     <>
                                       <span>•</span>
                                       <Badge variant="outline" className="text-xs">
                                         Quality: {article.content_quality_score}%
                                       </Badge>
                                     </>
                                   )}
                                 </div>
                                 
                                 {/* VOLUME-FIRST: Keyword Matches Display */}
                                 {article.import_metadata?.topic_relevance?.method === 'keyword' && 
                                  article.import_metadata?.topic_relevance?.details?.keyword_matches && (
                                   <div className="mb-3 p-2 bg-blue-50 rounded border-l-4 border-blue-200">
                                     <div className="text-xs font-medium text-blue-800 mb-1">Keyword Matches:</div>
                                     <div className="flex flex-wrap gap-1">
                                       {article.import_metadata.topic_relevance.details.keyword_matches.map((match: any, idx: number) => (
                                         <Badge key={idx} variant="secondary" className="text-xs">
                                           {match.keyword} ({match.count}x)
                                         </Badge>
                                       ))}
                                     </div>
                                   </div>
                                 )}
                                 
                                 <div className="flex items-center gap-2 mb-3 p-3 bg-muted/50 rounded-lg">
                                   <Link className="w-4 h-4 text-primary" />
                                   <a 
                                     href={article.source_url} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="text-primary hover:text-primary/80 font-medium truncate flex-1"
                                   >
                                     {new URL(article.source_url).hostname}
                                   </a>
                                   <ExternalLink className="w-4 h-4 text-muted-foreground" />
                                 </div>
                                 {article.summary && (
                                   <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{article.summary}</p>
                                 )}
                               </div>
                               <div className="flex items-center gap-2">
                                 <Button
                                   onClick={() => setPreviewArticle(article)}
                                   size="sm"
                                   variant="outline"
                                 >
                                   <Eye className="w-4 h-4" />
                                 </Button>
                               </div>
                             </div>
                           
                            <div className="space-y-3 pt-3 border-t">
                              <div className="space-y-2">
                                <Label htmlFor={`slide-qty-${article.id}`}>Slide Quantity</Label>
                                <Select 
                                  value={slideQuantities[article.id] || 'tabloid'} 
                                  onValueChange={(value: 'short' | 'tabloid' | 'indepth') => 
                                    setSlideQuantities(prev => ({ ...prev, [article.id]: value }))
                                  }
                                >
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select slide type" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="short">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="secondary">3-4 slides</Badge>
                                        Short Format
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="tabloid">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="default">5-6 slides</Badge>
                                        Tabloid Style
                                      </div>
                                    </SelectItem>
                                    <SelectItem value="indepth">
                                      <div className="flex items-center gap-2">
                                        <Badge variant="outline">7-8 slides</Badge>
                                        In-Depth Analysis
                                      </div>
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button 
                                  onClick={() => approveArticle(article.id, slideQuantities[article.id] || 'tabloid')}
                                  disabled={processingArticle === article.id}
                                  className="flex-1"
                                >
                                  {processingArticle === article.id ? 'Processing...' : 'Approve for Generation'}
                                </Button>
                                <Button
                                  variant="destructive"
                                  onClick={() => deleteArticle(article.id)}
                                  disabled={deletingArticles.has(article.id)}
                                >
                                  {deletingArticles.has(article.id) ? 'Deleting...' : 'Delete'}
                                </Button>
                              </div>
                            </div>
                         </div>
                       </div>
                     ))}
                  </div>
                ) : (
                   <div className="text-center py-8">
                     <CheckCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                     {articles.length === 0 ? (
                       <>
                         <h3 className="text-lg font-semibold mb-2">No pending articles</h3>
                         <p className="text-muted-foreground">
                           All articles for this topic have been processed, or no articles have been scraped yet.
                         </p>
                       </>
                     ) : (
                       <>
                         <h3 className="text-lg font-semibold mb-2">No articles match your filter</h3>
                         <p className="text-muted-foreground">
                           Try lowering the minimum relevance score to see more articles.
                         </p>
                         <Button 
                           variant="outline" 
                           size="sm" 
                           className="mt-3"
                           onClick={() => setMinRelevanceScore(0)}
                         >
                           Show All Articles
                         </Button>
                       </>
                     )}
                   </div>
                 )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="queue" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Processing Queue - {currentTopic?.name}</CardTitle>
                    <CardDescription>
                      Articles currently being processed into stories
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      onClick={handleRestalledProcessing}
                      disabled={isResettingStalled}
                      variant="outline"
                      size="sm"
                    >
                      {isResettingStalled ? "Resetting..." : "Reset Stalled"}
                    </Button>
                    <Button 
                      onClick={resetStuckProcessing}
                      disabled={isResettingStuck}
                      variant="outline"
                      size="sm"
                    >
                      {isResettingStuck ? "Resetting..." : "Reset Stuck Processing"}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : queueItems.length > 0 ? (
                  <div className="space-y-3">
                    {queueItems.map((item) => (
                      <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex-1">
                          <h3 className="font-medium mb-1">{item.article.title}</h3>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <Badge variant={
                              item.status === 'processing' ? 'default' : 
                              item.status === 'failed' ? 'destructive' : 'secondary'
                            }>
                              {item.status}
                            </Badge>
                            <span>Attempt {item.attempts}/{item.max_attempts}</span>
                            <span>{new Date(item.created_at).toLocaleDateString()}</span>
                          </div>
                          {item.error_message && (
                            <p className="text-sm text-red-600 mt-2">{item.error_message}</p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          {item.status === 'failed' && (
                            <Button 
                              onClick={() => reprocessQueueItem(item.id)}
                              size="sm" 
                              variant="outline"
                            >
                              Retry
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDeleteQueueItem(item.id, item.article.title)}
                            disabled={deletingQueueItems.has(item.id)}
                          >
                            <Trash2 className="w-4 h-4 mr-1" />
                            {deletingQueueItems.has(item.id) ? 'Deleting...' : 'Delete'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Clock className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No items in queue</h3>
                    <p className="text-muted-foreground">
                      Process queue is empty
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stories" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Ready Stories - {currentTopic?.name}</CardTitle>
                <CardDescription>
                  Generated stories ready for publication
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                  </div>
                ) : stories.length > 0 ? (
                  <div className="space-y-3">
                     {stories.map((story) => (
                       <div key={story.id} className="border rounded-lg">
                         <div className="p-4">
                             <div className="flex items-start justify-between mb-3">
                               <div className="flex-1">
                                 <h3 className="font-bold text-xl mb-3 text-primary leading-tight">{story.title}</h3>
                                 <div className="flex items-center gap-2 mb-3">
                                   <Link className="w-4 h-4 text-primary" />
                                   <a 
                                     href={story.article?.source_url} 
                                     target="_blank" 
                                     rel="noopener noreferrer"
                                     className="text-primary hover:text-primary/80 font-medium text-sm"
                                   >
                                     {story.article?.source_url ? new URL(story.article.source_url).hostname : 'Source'}
                                   </a>
                                   <ExternalLink className="w-3 h-3 text-muted-foreground" />
                                 </div>
                                 <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                   <Badge variant={story.status === 'ready' ? 'default' : 'secondary'}>{story.status}</Badge>
                                   <Badge variant={story.is_published ? 'default' : 'outline'}>
                                     {story.is_published ? 'Published' : 'Draft'}
                                   </Badge>
                                   <span className="font-medium">{story.slides.length} slides</span>
                                   <span>{new Date(story.created_at).toLocaleDateString()}</span>
                                 </div>
                               </div>
                               <div className="flex items-center gap-2">
                                 <CarouselGenerationButton 
                                   storyId={story.id}
                                   storyTitle={story.title}
                                 />
                                 <Button 
                                   size="sm"
                                   onClick={() => toggleStoryPublication(story.id, story.is_published)}
                                   disabled={publishingStories.has(story.id)}
                                   variant={story.is_published ? "destructive" : "default"}
                                 >
                                   {publishingStories.has(story.id) ? (
                                     <>
                                       <Loader2 className="w-4 h-4 animate-spin mr-1" />
                                       Processing...
                                     </>
                                   ) : story.is_published ? (
                                     <>
                                       <EyeOff className="w-4 h-4 mr-1" />
                                       Unpublish
                                     </>
                                   ) : (
                                     <>
                                       <Eye className="w-4 h-4 mr-1" />
                                       Publish
                                     </>
                                   )}
                                 </Button>
                                 <Button
                                   size="sm"
                                   variant="outline"
                                   onClick={() => setEditingStory(story)}
                                 >
                                   <Eye className="w-4 h-4 mr-1" />
                                   Preview
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => toggleStoryExpanded(story.id)}
                                >
                                  {expandedStories.has(story.id) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </Button>
                              </div>
                            </div>

                            {expandedStories.has(story.id) && (
                              <div className="mt-4 space-y-3 border-t pt-3">
                                <div className="grid gap-2">
                                  {story.slides?.map((slide: any) => (
                                    <div key={slide.id} className="p-3 bg-background rounded border">
                                      <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                          <Badge variant="outline" className="text-xs">
                                            Slide {slide.slide_number}
                                          </Badge>
                                          {getWordCountBadge(slide.content.split(' ').length)}
                                          <span className={`text-xs font-medium ${getWordCountColor(slide.content.split(' ').length, slide.slide_number)}`}>
                                            {slide.content.split(' ').length} words
                                          </span>
                                        </div>
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          onClick={() => {
                                            setEditingSlideId(slide.id);
                                            setEditingSlideContent(slide.content);
                                          }}
                                          className="flex items-center gap-1"
                                        >
                                          <Edit3 className="w-3 h-3" />
                                          Edit
                                        </Button>
                                      </div>
                                      <p className="text-sm text-muted-foreground line-clamp-3">{slide.content}</p>
                                    </div>
                                  ))}
                                </div>
                                
                                <div className="flex gap-2 pt-2 border-t">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleReturnToReview(story.id)}
                                    className="flex items-center gap-1"
                                  >
                                    <RotateCcw className="w-3 h-3" />
                                    Return to Review
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="destructive"
                                    onClick={() => handleDeleteStory(story.id, story.title)}
                                    disabled={deletingStories.has(story.id)}
                                    className="flex items-center gap-1"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    {deletingStories.has(story.id) ? 'Deleting...' : 'Delete Story'}
                                  </Button>
                                </div>
                              </div>
                            )}
                         </div>
                       </div>
                     ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <BarChart3 className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No stories ready</h3>
                    <p className="text-muted-foreground">
                      No completed stories for this topic yet
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      {/* Article Preview Dialog */}
      <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{previewArticle?.title}</DialogTitle>
            <DialogDescription>
              Article preview • {previewArticle?.word_count || 0} words
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2 text-sm text-muted-foreground">
              <Badge variant="outline">Quality: {previewArticle?.content_quality_score || 0}%</Badge>
              <Badge variant="outline">Relevance: {previewArticle?.regional_relevance_score || 0}%</Badge>
            </div>
            {previewArticle?.summary && (
              <div>
                <h4 className="font-medium mb-2">Summary</h4>
                <p className="text-sm">{previewArticle.summary}</p>
              </div>
            )}
            <div>
              <h4 className="font-medium mb-2">Content</h4>
              <div className="text-sm prose max-w-none">
                {previewArticle?.body ? (
                  <div className="whitespace-pre-wrap">{previewArticle.body.substring(0, 2000)}{previewArticle.body.length > 2000 ? '...' : ''}</div>
                ) : (
                  <p className="text-muted-foreground italic">No content available. Try extracting content first.</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" asChild>
                <a href={previewArticle?.source_url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Source
                </a>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Story Editing Dialog */}
      <Dialog open={!!editingStory} onOpenChange={() => setEditingStory(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Story: {editingStory?.title}</DialogTitle>
            <DialogDescription>
              Review and edit story slides • {editingStory?.slides.length || 0} slides
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {editingStory?.slides.map((slide, index) => (
              <div key={slide.id} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-medium">Slide {slide.slide_number}</h4>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setEditingSlideId(slide.id);
                      setEditingSlideContent(slide.content);
                    }}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                </div>
                {editingSlideId === slide.id ? (
                  <div className="space-y-2">
                    <Textarea
                      value={editingSlideContent}
                      onChange={(e) => setEditingSlideContent(e.target.value)}
                      className="min-h-[100px]"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={saveSlideEdit}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingSlideId('')}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm whitespace-pre-wrap">{slide.content}</p>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TopicAwareContentPipeline;