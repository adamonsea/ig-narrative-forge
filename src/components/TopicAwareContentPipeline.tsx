import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { 
  BarChart3, 
  RefreshCw, 
  Loader2,
  Bell
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { InlineCarouselImages } from '@/components/InlineCarouselImages';
import { Textarea } from "@/components/ui/textarea";
import { useTopicPipeline } from "@/hooks/useTopicPipeline";
import { useTopicPipelineActions } from "@/hooks/useTopicPipelineActions";
import { useSentimentCards } from "@/hooks/useSentimentCards";
import { SentimentManager } from "@/components/SentimentManager";
import { ArticlesList } from "./topic-pipeline/ArticlesList";
import { QueueList } from "./topic-pipeline/QueueList";
import { StoriesList } from "./topic-pipeline/StoriesList";
import { UnifiedArticlesList } from "./topic-pipeline/UnifiedArticlesList";
import { useMultiTenantTopicPipeline } from "@/hooks/useMultiTenantTopicPipeline";
import { useMultiTenantActions } from "@/hooks/useMultiTenantActions";


interface Topic {
  id: string;
  name: string;
  topic_type: 'regional' | 'keyword';
  is_active: boolean;
  default_tone?: 'formal' | 'conversational' | 'engaging';
  default_writing_style?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  audience_expertise?: 'beginner' | 'intermediate' | 'expert';
  keywords?: string[];
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
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

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string | null;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface TopicAwareContentPipelineProps {
  selectedTopicId?: string;
}

export const TopicAwareContentPipeline: React.FC<TopicAwareContentPipelineProps> = ({ selectedTopicId: propTopicId }) => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [selectedTopicId, setSelectedTopicId] = useState(propTopicId || '');
  const [slideQuantities, setSlideQuantities] = useState<{ [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' }>({});
  const [toneOverrides, setToneOverrides] = useState<{ [key: string]: 'formal' | 'conversational' | 'engaging' }>({});
  const [writingStyleOverrides, setWritingStyleOverrides] = useState<{ [key: string]: 'journalistic' | 'educational' | 'listicle' | 'story_driven' }>({});
  const [aiProvider, setAiProvider] = useState<'openai' | 'deepseek'>('deepseek');
  const [currentTopic, setCurrentTopic] = useState<any>(null);
  const [previewArticle, setPreviewArticle] = useState<Article | null>(null);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [viewingStory, setViewingStory] = useState<any>(null);
  const [isGathering, setIsGathering] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  // Add sentiment cards hook - only pass topicId when it's properly loaded
  const { reviewCount } = useSentimentCards(selectedTopicId && selectedTopicId.trim() !== '' ? selectedTopicId : undefined);

  const {
    articles,
    queueItems,
    stories,
    loading,
    stats,
    loadTopicContent,
    getAutoSlideType: originalGetAutoSlideType,
    optimisticallyRemoveArticle
  } = useTopicPipeline(selectedTopicId);

  // Memoize getAutoSlideType to prevent infinite loops
  const getAutoSlideType = useCallback((wordCount: number) => {
    return originalGetAutoSlideType(wordCount);
  }, [originalGetAutoSlideType]);

  const {
    processingArticle,
    processingApproval,
    processingRejection,
    deletingStories,
    deletingQueueItems,
    deletingArticles,
    animatingArticles,
    animatingStories,
    approveArticle,
    approveStory,
    rejectStory,
    returnToReview,
    deleteStory,
    cancelQueueItem,
    deleteArticle
  } = useTopicPipelineActions(loadTopicContent, optimisticallyRemoveArticle);

  // Multi-tenant pipeline integration
  const {
    articles: multiTenantArticles,
    queueItems: multiTenantQueueItems,
    stories: multiTenantStories,
    stats: multiTenantStats,
    loading: multiTenantLoading,
    loadTopicContent: refreshMultiTenantContent,
    handleMultiTenantApprove: handleMultiTenantArticleApprove,
    handleMultiTenantDelete: handleMultiTenantArticleDelete,
    handleMultiTenantBulkDelete: handleMultiTenantBulkDelete,
    handleMultiTenantCancelQueue: handleMultiTenantCancelQueueItem,
    handleMultiTenantApproveStory: handleMultiTenantApproveStory,
    handleMultiTenantRejectStory: handleMultiTenantRejectStory,
    processingArticle: multiTenantProcessingArticle,
    deletingArticles: multiTenantDeletingArticles,
    animatingArticles: multiTenantAnimatingArticles
  } = useMultiTenantTopicPipeline(selectedTopicId);

  // Initialize slide quantities with auto-selected values, but allow user to change them
  useEffect(() => {
    if (articles.length > 0) {
      const newSlideQuantities: { [key: string]: 'short' | 'tabloid' | 'indepth' | 'extensive' } = {};
      let hasNewQuantities = false;
      
      articles.forEach(article => {
        // Only set if not already set by user
        if (!slideQuantities[article.id]) {
          newSlideQuantities[article.id] = getAutoSlideType(article.word_count || 0);
          hasNewQuantities = true;
        }
      });
      
      if (hasNewQuantities) {
        setSlideQuantities(prev => ({ ...prev, ...newSlideQuantities }));
      }
    }
  }, [articles]); // Remove getAutoSlideType to prevent infinite loop

  // Set up real-time subscriptions for pipeline updates
  useEffect(() => {
    if (!selectedTopicId) return;

    const channel = supabase
      .channel('topic-pipeline-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'articles',
          filter: `topic_id=eq.${selectedTopicId}`
        },
        () => {
          console.log('Article updated, refreshing content...');
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
          console.log('Queue updated, refreshing content...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        () => {
          console.log('Stories updated, refreshing content...');
          loadTopicContent();
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'topics',
          filter: `id=eq.${selectedTopicId}`
        },
        () => {
          console.log('Topic settings updated, refreshing...');
          loadCurrentTopic();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedTopicId, loadTopicContent]);

  // Update selectedTopicId if propTopicId changes
  useEffect(() => {
    if (propTopicId && propTopicId !== selectedTopicId) {
      setSelectedTopicId(propTopicId);
    }
  }, [propTopicId]);

  useEffect(() => {
    loadTopics();
  }, []);

  // Load topic data including default tone
  useEffect(() => {
    if (selectedTopicId) {
      loadCurrentTopic();
      loadTopicContent();
      
      // Force immediate refresh to catch any articles not showing due to real-time issues
      const forceRefresh = setTimeout(() => {
        loadTopicContent();
        console.log('🔄 Force refresh completed for topic:', selectedTopicId);
      }, 1000);
      
      return () => clearTimeout(forceRefresh);
    }
  }, [selectedTopicId]);

  const loadCurrentTopic = async () => {
    try {
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, topic_type, is_active, default_tone, default_writing_style, audience_expertise, keywords, landmarks, postcodes, organizations')
        .eq('id', selectedTopicId)
        .single();

      if (error) throw error;
      
      // Check if global settings changed and clear individual overrides
      if (currentTopic && data) {
        const toneChanged = currentTopic.default_tone !== data.default_tone;
        const styleChanged = currentTopic.default_writing_style !== data.default_writing_style;
        
        if (toneChanged || styleChanged) {
          console.log('Global topic settings changed, clearing individual overrides');
          if (toneChanged) {
            setToneOverrides({});
          }
          if (styleChanged) {
            setWritingStyleOverrides({});
          }
        }
      }
      
      setCurrentTopic(data);
    } catch (error) {
      console.error('Error loading current topic:', error);
    }
  };

  const handleToneOverrideChange = (articleId: string, tone: 'formal' | 'conversational' | 'engaging') => {
    setToneOverrides(prev => ({
      ...prev,
      [articleId]: tone
    }));
  };

  const handleWritingStyleOverrideChange = (articleId: string, style: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => {
    setWritingStyleOverrides(prev => ({
      ...prev,
      [articleId]: style
    }));
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

  const handleSlideQuantityChange = (articleId: string, quantity: 'short' | 'tabloid' | 'indepth' | 'extensive') => {
    setSlideQuantities(prev => ({
      ...prev,
      [articleId]: quantity
    }));
  };

  const handleGatherAll = async () => {
    if (!selectedTopicId || isGathering) return;
    
    try {
      setIsGathering(true);
      console.log('Starting topic-wide content gathering for:', selectedTopicId);
      
      toast({
        title: "Gathering Content",
        description: "Starting to scrape all sources for this topic...",
      });

      // Use the keyword-rescan-trigger function which handles scraping all sources for a topic
      const { data, error } = await supabase.functions.invoke('keyword-rescan-trigger', {
        body: { 
          topicId: selectedTopicId,
          triggerType: 'manual_gather'
        }
      });

      if (error) throw error;

      // Handle the enhanced response format with partial success support
      if (data.isPartialSuccess) {
        toast({
          title: "Partial Success",
          description: `${data.message}. ${data.totalArticles} new articles found. Some sources failed.`,
          variant: "default",
        });
        
        console.log('Gathering completed with partial success:', {
          successRate: data.successRate,
          totalArticles: data.totalArticles,
          recommendations: data.recommendations,
          errorsByType: data.errorsByType
        });
        
        // Show recommendations if available
        if (data.recommendations?.length > 0) {
          // You could enhance this to show recommendations in a modal or notification
          console.log('Recommendations for improving gathering:', data.recommendations);
        }
        
      } else if (data.isCompleteFailure) {
        throw new Error(`All sources failed: ${data.message}`);
        
      } else if (data.success) {
        toast({
          title: "Content Gathering Complete",
          description: `Successfully gathered ${data.totalArticles || 0} articles from ${data.successful}/${data.sourcesTriggered} sources`,
        });
      } else {
        throw new Error(data?.error || 'Content gathering failed');
      }

      // Always refresh the content after any gathering attempt
      loadTopicContent();

    } catch (error: any) {
      console.error('Error gathering content:', error);
      toast({
        title: "Gathering Failed", 
        description: error.message || "Failed to gather content from sources",
        variant: "destructive",
      });
    } finally {
      setIsGathering(false);
    }
  };

  const highlightKeywordsInText = (text: string, keywords: string[], landmarks: string[]): React.ReactNode => {
    if (!text || (!keywords.length && !landmarks.length)) {
      return <span className="whitespace-pre-wrap">{text}</span>;
    }

    // Combine all keywords and landmarks
    const allKeywords = [...keywords, ...landmarks].filter(k => k && k.trim().length > 0);
    
    if (allKeywords.length === 0) {
      return <span className="whitespace-pre-wrap">{text}</span>;
    }

    // Generate keyword variations for better matching (same as scoring system)
    const generateKeywordVariations = (keyword: string): string[] => {
      const variations = [keyword];
      
      // Add plural/singular variations
      if (keyword.endsWith('s') && keyword.length > 3) {
        variations.push(keyword.slice(0, -1));
      } else {
        variations.push(keyword + 's');
      }
      
      // Add common synonyms
      const synonymMap: { [key: string]: string[] } = {
        'ai': ['artificial intelligence', 'machine learning', 'ml'],
        'agency': ['agencies', 'firm', 'company', 'studio'],
        'marketing': ['advertising', 'promotion', 'branding'],
        'creative': ['creativity', 'design', 'artistic'],
        'film': ['movie', 'cinema', 'picture'],
        'children': ['kids', 'child', 'youth']
      };
      
      if (synonymMap[keyword.toLowerCase()]) {
        variations.push(...synonymMap[keyword.toLowerCase()]);
      }
      
      return [...new Set(variations)];
    };

    // Generate all variations for highlighting
    const allVariations: string[] = [];
    allKeywords.forEach(keyword => {
      const variations = generateKeywordVariations(keyword.toLowerCase().trim());
      allVariations.push(...variations);
    });

    // Create enhanced regex pattern (exact and partial matches like scoring system)
    const exactPattern = allVariations.map(v => `\\b${v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).join('|');
    const partialPattern = allVariations.map(v => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const combinedPattern = new RegExp(`(${exactPattern}|${partialPattern})`, 'gi');
    
    // Split the text and highlight matches
    const parts = text.split(combinedPattern);
    const matches = text.match(combinedPattern) || [];
    let matchIndex = 0;
    
    // Debug logging to show what was highlighted
    console.log('Highlighting debug:', {
      originalKeywords: allKeywords,
      allVariations: allVariations.slice(0, 10), // Show first 10 variations
      matchesFound: matches.length,
      firstFewMatches: matches.slice(0, 5)
    });
    
    return (
      <span className="whitespace-pre-wrap">
        {parts.map((part, index) => {
          if (index < parts.length - 1) {
            // This is a non-keyword part followed by a keyword
            const keyword = matches[matchIndex] || '';
            matchIndex++;
            return (
              <span key={index}>
                {part}
                <mark 
                  className="bg-warning/20 text-warning-foreground px-1 py-0.5 rounded font-medium border border-warning/30"
                  title={`Matched keyword variation: ${keyword}`}
                >
                  {keyword}
                </mark>
              </span>
            );
          } else {
            // This is the last part (no keyword after it)
            return <span key={index}>{part}</span>;
          }
        })}
      </span>
    );
  };

  const handleEditSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setEditContent(slide.content);
  };

  const handleSaveSlide = async () => {
    if (!editingSlide) return;

    try {
      const { error } = await supabase
        .from('slides')
        .update({ content: editContent })
        .eq('id', editingSlide.id);

      if (error) throw error;

      toast({
        title: "Slide Updated",
        description: "Slide content has been saved"
      });

      setEditingSlide(null);
      setEditContent('');
      loadTopicContent();
    } catch (error) {
      console.error('Error updating slide:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update slide content",
        variant: "destructive"
      });
    }
  };

  const toggleStoryExpanded = (storyId: string) => {
    setExpandedStories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(storyId)) {
        newSet.delete(storyId);
      } else {
        newSet.add(storyId);
      }
      return newSet;
    });
  };

  // Debug logging
  console.log('TopicAwareContentPipeline render:', { 
    user: !!user, 
    selectedTopicId, 
    propTopicId, 
    loading, 
    articlesCount: articles.length,
    stats 
  });

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Please sign in to access the content pipeline.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topic Selection */}
      {!propTopicId && (
        <Card>
          <CardHeader>
            <CardTitle>Select Topic</CardTitle>
            <CardDescription>Choose a topic to manage its content pipeline</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4">
              <Label htmlFor="topic-select">Topic:</Label>
              <Select 
                value={selectedTopicId} 
                onValueChange={setSelectedTopicId}
              >
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Select a topic" />
                </SelectTrigger>
                <SelectContent>
                  {topics.map((topic) => (
                    <SelectItem key={topic.id} value={topic.id}>
                      {topic.name} ({topic.topic_type})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedTopicId && (
        <>
          {/* Content Pipeline Tabs */}
          <Tabs defaultValue="pending" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="pending">
                Pending Articles ({articles.filter((a: any) => !a.is_low_score).length})
              </TabsTrigger>
              <TabsTrigger value="queue">
                Generation Queue ({queueItems.length})
              </TabsTrigger>
              <TabsTrigger value="stories" className="relative">
                Published Stories ({stories.length})
                {reviewCount > 0 && (
                  <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                    {reviewCount}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

              <TabsContent value="pending" className="space-y-4">
                {/* Multi-tenant Articles */}
                <UnifiedArticlesList
                  articles={multiTenantArticles}
                  processingArticle={multiTenantProcessingArticle}
                  deletingArticles={multiTenantDeletingArticles}
                  animatingArticles={multiTenantAnimatingArticles}
                  slideQuantities={slideQuantities}
                  toneOverrides={toneOverrides}
                  writingStyleOverrides={writingStyleOverrides}
                  onSlideQuantityChange={handleSlideQuantityChange}
                  onToneOverrideChange={handleToneOverrideChange}
                  onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                  onPreview={(article) => setPreviewArticle({
                    ...article,
                    source_url: article.url,
                    processing_status: article.processing_status || 'new',
                    content_quality_score: article.content_quality_score || 0,
                    regional_relevance_score: article.regional_relevance_score || 0
                  } as any)}
                  onApprove={handleMultiTenantArticleApprove}
                  onDelete={handleMultiTenantArticleDelete}
                  onBulkDelete={handleMultiTenantBulkDelete}
                  defaultTone={currentTopic?.default_tone || 'conversational'}
                  defaultWritingStyle={currentTopic?.default_writing_style || 'journalistic'}
                  topicKeywords={currentTopic?.keywords || []}
                  topicLandmarks={currentTopic?.landmarks || []}
                  onRefresh={refreshMultiTenantContent}
                />
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-semibold">Pending Articles</h3>
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={handleGatherAll}
                      disabled={isGathering}
                      variant="outline"
                      className="flex items-center gap-2"
                    >
                      {isGathering ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                      {isGathering ? 'Gathering...' : 'Gather All Sources'}
                    </Button>
                  </div>
                </div>
                
                {/* High Quality Articles */}
                <ArticlesList
                  articles={articles.filter((a: any) => !a.is_low_score)}
                  processingArticle={processingArticle}
                  slideQuantities={slideQuantities}
                  deletingArticles={deletingArticles}
                  animatingArticles={animatingArticles}
                  toneOverrides={toneOverrides}
                  writingStyleOverrides={writingStyleOverrides}
                  defaultTone={currentTopic?.default_tone || 'conversational'}
                  defaultWritingStyle={currentTopic?.default_writing_style || 'journalistic'}
                  topicKeywords={currentTopic?.keywords || []}
                  topicLandmarks={currentTopic?.landmarks || []}
                  onRefresh={loadTopicContent}
                  onSlideQuantityChange={handleSlideQuantityChange}
                  onToneOverrideChange={handleToneOverrideChange}
                  onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                  onApprove={(articleId, slideType, tone, writingStyle) => approveArticle(articleId, slideType, tone, writingStyle)}
                  onPreview={(article) => setPreviewArticle(article)}
                  onDelete={deleteArticle}
                />
                
                {/* Low Quality Articles Section */}
                {articles.filter((a: any) => a.is_low_score).length > 0 && (
                  <div className="space-y-4">
                    <div className="border-t pt-6">
                      <div className="flex items-center gap-2 mb-4">
                        <Badge variant="destructive" className="text-xs">
                          Low Relevance
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {articles.filter((a: any) => a.is_low_score).length} articles with low relevance scores
                        </span>
                      </div>
                      <ArticlesList 
                        articles={articles.filter((a: any) => a.is_low_score)}
                        processingArticle={processingArticle}
                        slideQuantities={slideQuantities}
                        deletingArticles={deletingArticles}
                        animatingArticles={animatingArticles}
                        toneOverrides={toneOverrides}
                        writingStyleOverrides={writingStyleOverrides}
                        defaultTone={currentTopic?.default_tone || 'conversational'}
                        defaultWritingStyle={currentTopic?.default_writing_style || 'journalistic'}
                        topicKeywords={currentTopic?.keywords || []}
                        topicLandmarks={currentTopic?.landmarks || []}
                        onRefresh={loadTopicContent}
                        onSlideQuantityChange={handleSlideQuantityChange}
                        onToneOverrideChange={handleToneOverrideChange}
                        onWritingStyleOverrideChange={handleWritingStyleOverrideChange}
                        onApprove={(articleId, slideType, tone, writingStyle) => approveArticle(articleId, slideType, tone, writingStyle)}
                        onPreview={(article) => setPreviewArticle(article)}
                        onDelete={deleteArticle}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="queue" className="space-y-6">
                <QueueList
                  queueItems={queueItems}
                  deletingQueueItems={deletingQueueItems}
                  onCancel={cancelQueueItem}
                  onRetry={(queueId) => console.log('Retry not implemented yet')}
                />
              </TabsContent>

              <TabsContent value="stories" className="space-y-6">
                <Tabs defaultValue="stories" className="space-y-4">
                  <TabsList className="w-full">
                    <TabsTrigger value="stories" className="flex-1">Stories</TabsTrigger>
                    <TabsTrigger value="sentiment" className="flex-1 relative">
                      Sentiment Cards
                      {reviewCount > 0 && (
                        <Badge variant="destructive" className="ml-2 h-5 w-5 rounded-full p-0 text-xs flex items-center justify-center">
                          {reviewCount}
                        </Badge>
                      )}
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="stories">
                    <StoriesList
                      stories={stories}
                      expandedStories={expandedStories}
                      processingApproval={processingApproval}
                      processingRejection={processingRejection}
                      deletingStories={deletingStories}
                      publishingStories={new Set()}
                      animatingStories={animatingStories}
                      onToggleExpanded={toggleStoryExpanded}
                      onApprove={approveStory}
                      onReject={rejectStory}
                      onDelete={deleteStory}
                      onReturnToReview={returnToReview}
                      onEditSlide={handleEditSlide}
                      onViewStory={setViewingStory}
                      onRefresh={loadTopicContent}
                    />
                  </TabsContent>

                  <TabsContent value="sentiment">
                    <SentimentManager topicId={selectedTopicId} />
                  </TabsContent>
                </Tabs>
              </TabsContent>
          </Tabs>

          {/* View Story Dialog */}
          <Dialog open={!!viewingStory} onOpenChange={() => setViewingStory(null)}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{viewingStory?.title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div>
                  <h4 className="font-medium mb-2">Story Details</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Status:</span>
                      <Badge variant={viewingStory?.status === 'ready' ? 'default' : 'secondary'} className="ml-2">
                        {viewingStory?.status}
                      </Badge>
                    </div>
                    <div>
                      <span className="font-medium">Created:</span> {viewingStory ? new Date(viewingStory.created_at).toLocaleString() : ''}
                    </div>
                    <div>
                      <span className="font-medium">Author:</span> {viewingStory?.author || 'Unknown'}
                    </div>
                    <div>
                      <span className="font-medium">Publication:</span> {viewingStory?.publication_name || 'Unknown'}
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium mb-2">Slides ({viewingStory?.slides?.length || 0})</h4>
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {viewingStory?.slides?.map((slide: any, index: number) => (
                      <div key={slide.id} className="p-3 bg-muted rounded-lg">
                        <div className="font-medium text-sm mb-1">Slide {index + 1}</div>
                        <p className="text-sm">{slide.content}</p>
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </DialogContent>
          </Dialog>

          {/* Edit Slide Dialog */}
          <Dialog open={!!editingSlide} onOpenChange={() => setEditingSlide(null)}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Edit Slide Content</DialogTitle>
                <DialogDescription>
                  Modify the content for slide {editingSlide?.slide_number}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={6}
                  placeholder="Enter slide content..."
                />
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingSlide(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSlide}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          {/* Article Preview Dialog */}
          <Dialog open={!!previewArticle} onOpenChange={() => setPreviewArticle(null)}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{previewArticle?.title}</DialogTitle>
                <DialogDescription>
                  Article preview - {previewArticle?.word_count} words
                  {currentTopic?.keywords?.length > 0 && (
                    <span className="ml-2 text-accent">
                      • Keywords highlighted below
                    </span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p><strong>Author:</strong> {previewArticle?.author || 'Unknown'}</p>
                  <p><strong>Published:</strong> {previewArticle?.published_at ? new Date(previewArticle.published_at).toLocaleDateString() : 'Unknown'}</p>
                  <p><strong>Source:</strong> <a href={previewArticle?.source_url} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">{previewArticle?.source_url}</a></p>
                </div>
                <div className="prose max-w-none">
                  {highlightKeywordsInText(
                    previewArticle?.body || '', 
                    currentTopic?.keywords || [],
                    currentTopic?.landmarks || []
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
};