import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ArticlePipelinePanel } from '@/components/ArticlePipelinePanel';
import { ApprovedStoriesPanel } from '@/components/ApprovedStoriesPanel';
import { StoryLifecycleTooltip } from '@/components/StoryLifecycleTooltip';
import { 
  CheckCircle2, 
  X, 
  Edit3,
  Eye,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Calendar,
  User,
  BookOpen,
  AlertTriangle,
  Trash2
} from 'lucide-react';

// Slide and Story interfaces  
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
  id: string;
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
  // Lifecycle tracking
  simplified_at?: string | null;
  illustration_generated_at?: string | null;
  animation_generated_at?: string | null;
  is_auto_gathered?: boolean;
  is_auto_simplified?: boolean;
  is_auto_illustrated?: boolean;
  is_auto_animated?: boolean;
}

interface ContentPipelineProps {
  onRefresh?: () => void;
}

export const ContentPipeline = ({ onRefresh }: ContentPipelineProps) => {
  // Story state
  const [stories, setStories] = useState<Story[]>([]);
  const [loadingStories, setLoadingStories] = useState(true);
  const [expandedStories, setExpandedStories] = useState<Set<string>>(new Set());
  const [processingApproval, setProcessingApproval] = useState<Set<string>>(new Set());
  const [processingRejection, setProcessingRejection] = useState<Set<string>>(new Set());
  const [deletingStories, setDeletingStories] = useState<Set<string>>(new Set());

  // Edit slide state
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');

  const { toast } = useToast();

  useEffect(() => {
    loadStories();
  }, []);

  // Real-time subscription for stories and queue changes
  useEffect(() => {
    console.log('🔄 Setting up ContentPipeline real-time subscriptions...');
    
    const channel = supabase
      .channel('content-pipeline-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'stories'
        },
        (payload) => {
          console.log('🔄 Stories changed in ContentPipeline, reloading...', payload);
          loadStories();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'slides'
        },
        (payload) => {
          console.log('🔄 Slides changed in ContentPipeline, reloading...', payload);
          loadStories();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'content_generation_queue'
        },
        (payload) => {
          console.log('🔄 Queue changed in ContentPipeline, reloading...', payload);
          loadStories();
        }
      )
      .subscribe((status) => {
        console.log('🔄 ContentPipeline real-time subscription status:', status);
      });

    return () => {
      console.log('🔄 Cleaning up ContentPipeline real-time subscriptions...');
      supabase.removeChannel(channel);
    };
  }, []);

  const loadStories = async () => {
    setLoadingStories(true);
    try {
      const { data: stories, error } = await supabase
        .from('stories')
        .select(`
          *,
          slides:slides(*),
          article:articles!stories_article_id_fkey(
            id,
            title,
            author,
            source_url,
            region,
            published_at,
            word_count
          )
        `)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      const storiesWithSlides = (stories || []).filter(story => 
        story.slides && story.slides.length > 0
      );
      
      setStories(storiesWithSlides);
    } catch (error) {
      console.error('Error loading stories:', error);
      toast({
        title: "Error",
        description: "Failed to load stories",
        variant: "destructive",
      });
    } finally {
      setLoadingStories(false);
    }
  };

  const handleApproveStory = async (storyId: string) => {
    if (processingApproval.has(storyId)) return;
    
    setProcessingApproval(prev => new Set(prev.add(storyId)));
    
    try {
      // Find the story to get its data for carousel generation
      const story = stories.find(s => s.id === storyId);
      if (!story) {
        throw new Error('Story not found');
      }

      // Update story status to ready
      const { error } = await supabase
        .from('stories')
        .update({ status: 'ready' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: "Story Approved",
        description: "Story has been approved successfully",
      });

      loadStories();
      onRefresh?.();
    } catch (error) {
      console.error('Error approving story:', error);
      toast({
        title: "Error",
        description: "Failed to approve story. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessingApproval(prev => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
      });
    }
  };

  const handleRejectStory = async (storyId: string) => {
    if (processingRejection.has(storyId)) return;
    
    setProcessingRejection(prev => new Set(prev.add(storyId)));
    
    try {
      const { error: storyError } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (storyError) throw storyError;
      
      setStories(stories.filter(story => story.id !== storyId));
      toast({
        title: "Story Rejected",
        description: "Story deleted and article returned to validation queue.",
      });

      loadStories();
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({
        title: "Error", 
        description: "Failed to reject story. Please try again.",
        variant: "destructive",
      });
    } finally {
      setProcessingRejection(prev => {
        const next = new Set(prev);
        next.delete(storyId);
        return next;
      });
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

      loadStories();
    } catch (error) {
      console.error('Failed to return story:', error);
      toast({
        title: 'Error',
        description: 'Failed to return story to review',
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
      loadStories();
      onRefresh?.();
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

  const handleEditSlide = (slide: Slide) => {
    setEditingSlide(slide);
    setEditContent(slide.content);
  };

  const handleSaveSlide = async () => {
    if (!editingSlide) return;

    try {
      const wordCount = editContent.trim().split(/\s+/).length;
      
      const { error } = await supabase
        .from('slides')
        .update({ 
          content: editContent.trim(),
          word_count: wordCount
        })
        .eq('id', editingSlide.id);

      if (error) throw error;

      toast({
        title: 'Slide Updated',
        description: 'Slide content has been updated',
      });

      setEditingSlide(null);
      loadStories();
    } catch (error) {
      console.error('Failed to update slide:', error);
      toast({
        title: 'Error',
        description: 'Failed to update slide',
        variant: 'destructive',
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-green-500">Published</Badge>;
      case 'draft':
        return <Badge variant="outline">Pending Review</Badge>;
      case 'ready':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Ready</Badge>;
      case 'processing':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Processing</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel: Content Pipeline */}
      <div className="space-y-6">
        <ArticlePipelinePanel onRefresh={onRefresh} />
      </div>

      {/* Right Panel: Draft Stories Under Review and Approved Queue */}
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-blue-600" />
              Draft Stories Under Review ({stories.length})
            </CardTitle>
            <CardDescription>
              Review generated stories before approval
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStories ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : stories.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No draft stories pending review</p>
              </div>
            ) : (
              <div className="space-y-4">
                {stories.map((story) => {
                  const isExpanded = expandedStories.has(story.id);
                  return (
                    <Card key={story.id} className="border-blue-200 bg-blue-50">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              {getStatusBadge(story.status)}
                              <Badge variant="outline" className="text-xs">
                                {story.slides.length} slides
                              </Badge>
                            </div>
                            <StoryLifecycleTooltip
                              gatheredAt={story.created_at}
                              simplifiedAt={story.simplified_at}
                              illustratedAt={story.illustration_generated_at}
                              animatedAt={story.animation_generated_at}
                              isAutoGathered={story.is_auto_gathered}
                              isAutoSimplified={story.is_auto_simplified}
                              isAutoIllustrated={story.is_auto_illustrated}
                              isAutoAnimated={story.is_auto_animated}
                            >
                              <h3 className="font-medium text-sm mb-1 line-clamp-2 cursor-help">{story.title}</h3>
                            </StoryLifecycleTooltip>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                              <User className="w-3 h-3" />
                              <span>{story.article?.author || 'Unknown Author'}</span>
                              <span>•</span>
                              <Calendar className="w-3 h-3" />
                              <span>{new Date(story.created_at).toLocaleDateString()}</span>
                              {story.article?.region && (
                                <>
                                  <span>•</span>
                                  <Badge variant="outline" className="text-xs">{story.article.region}</Badge>
                                </>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            <Button
                              size="sm"
                              onClick={() => handleApproveStory(story.id)}
                              disabled={processingApproval.has(story.id)}
                              className="flex items-center gap-1"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              {processingApproval.has(story.id) ? 'Processing...' : 'Approve'}
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              onClick={() => handleRejectStory(story.id)}
                              disabled={processingRejection.has(story.id)}
                              className="flex items-center gap-1"
                            >
                              <X className="w-3 h-3" />
                              {processingRejection.has(story.id) ? 'Processing...' : 'Reject'}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleStoryExpanded(story.id)}
                              className="ml-2"
                            >
                              {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>
                        
                        {isExpanded && (
                          <div className="mt-4 space-y-3 border-t pt-3">
                            <div className="grid gap-2">
                              {story.slides.map((slide) => (
                                <div key={slide.id} className="p-3 bg-white rounded border">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <Badge variant="outline" className="text-xs">
                                        Slide {slide.slide_number}
                                      </Badge>
                                      {getWordCountBadge(slide.word_count)}
                                      <span className={`text-xs font-medium ${getWordCountColor(slide.word_count, slide.slide_number)}`}>
                                        {slide.word_count} words
                                      </span>
                                    </div>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => handleEditSlide(slide)}
                                      className="flex items-center gap-1"
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      Edit
                                    </Button>
                                  </div>
                                  <p className="text-sm text-gray-700 line-clamp-3">{slide.content}</p>
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
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <ApprovedStoriesPanel />
      </div>

      {/* Edit Slide Dialog */}
      <Dialog open={!!editingSlide} onOpenChange={() => setEditingSlide(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Slide Content</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              placeholder="Enter slide content..."
              className="min-h-32"
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
    </div>
  );
};