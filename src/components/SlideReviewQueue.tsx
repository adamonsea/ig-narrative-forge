import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  CheckCircle, 
  XCircle, 
  Edit3, 
  Eye, 
  Clock, 
  Sparkles,
  ArrowRight,
  RotateCcw,
  AlertTriangle
} from 'lucide-react';

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  alt_text: string | null;
  word_count: number;
  story_id: string;
}

interface Story {
  id: string;
  title: string;
  status: string;
  article_id: string;
  created_at: string;
  slides: Slide[];
}

export const SlideReviewQueue = () => {
  const { toast } = useToast();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [editContent, setEditContent] = useState('');

  useEffect(() => {
    loadPendingStories();
  }, []);

  const loadPendingStories = async () => {
    try {
      setLoading(true);
      console.log('Loading pending stories (draft status)...');
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id,
          title,
          status,
          article_id,
          created_at,
          slides (
            id,
            slide_number,
            content,
            alt_text,
            word_count,
            story_id
          )
        `)
        .eq('status', 'draft')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;
      
      console.log('Loaded draft stories:', data?.length || 0);
      if (data && data.length > 0) {
        console.log('Stories with slide counts:', data.map(s => ({
          id: s.id,
          title: s.title,
          slideCount: s.slides?.length || 0
        })));
      }
      setStories(data || []);
    } catch (error) {
      console.error('Failed to load stories:', error);
      toast({
        title: 'Error',
        description: 'Failed to load slide queue',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveStory = async (storyId: string) => {
    try {
      const { error } = await supabase
        .from('stories')
        .update({ status: 'approved' })
        .eq('id', storyId);

      if (error) throw error;

      toast({
        title: 'Story Approved',
        description: 'Story approved and ready for publishing',
      });

      loadPendingStories();
    } catch (error) {
      console.error('Failed to approve story:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve story',
        variant: 'destructive',
      });
    }
  };

  const handleRejectStory = async (storyId: string) => {
    try {
      // Delete the story and its slides instead of setting rejected status
      // First delete associated slides
      const { error: slidesError } = await supabase
        .from('slides')
        .delete()
        .eq('story_id', storyId);

      if (slidesError) throw slidesError;

      // Then delete the story (this will return the article to validation queue)
      const { error: storyError } = await supabase
        .from('stories')
        .delete()
        .eq('id', storyId);

      if (storyError) throw storyError;
      
      setStories(stories.filter(story => story.id !== storyId));
      toast({
        title: "Story rejected",
        description: "Story has been rejected and the article returned to validation queue.",
      });
    } catch (error) {
      console.error('Error rejecting story:', error);
      toast({
        title: "Error", 
        description: "Failed to reject story. Please try again.",
        variant: "destructive",
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
      loadPendingStories();
    } catch (error) {
      console.error('Failed to update slide:', error);
      toast({
        title: 'Error',
        description: 'Failed to update slide',
        variant: 'destructive',
      });
    }
  };

  const getWordCountBadge = (wordCount: number) => {
    if (wordCount <= 15) return <Badge variant="default" className="text-xs">Hook</Badge>;
    if (wordCount <= 30) return <Badge variant="secondary" className="text-xs">Body</Badge>;
    return <Badge variant="outline" className="text-xs">Long</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading slide queue...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Queue Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Slide Review Queue</h2>
          <p className="text-muted-foreground">
            Review and approve AI-generated slide carousels for Eastbourne news
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary">{stories.length} pending</Badge>
          <Button variant="outline" onClick={loadPendingStories}>
            <RotateCcw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stories Queue */}
      <div className="space-y-6">
        {stories.map((story) => (
          <Card key={story.id} className="overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-lg">{story.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-2">
                    <Badge variant="secondary">{story.slides?.length || 0} slides</Badge>
                    <Badge variant="outline">
                      <Clock className="w-3 h-3 mr-1" />
                      {new Date(story.created_at).toLocaleDateString()}
                    </Badge>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRejectStory(story.id)}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    Reject
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApproveStory(story.id)}
                  >
                    <CheckCircle className="w-4 h-4 mr-1" />
                    Approve
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {/* Slides Preview */}
              <div className="space-y-3">
                {story.slides && story.slides.length > 0 ? (
                  story.slides.map((slide, index) => (
                    <div key={slide.id} className="border rounded-lg p-4 bg-muted/30">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            Slide {slide.slide_number}
                          </Badge>
                          {getWordCountBadge(slide.word_count)}
                          <span className="text-xs text-muted-foreground">
                            {slide.word_count} words
                          </span>
                        </div>
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEditSlide(slide)}
                        >
                          <Edit3 className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      <p className="text-sm leading-relaxed">{slide.content}</p>
                      
                      {slide.alt_text && (
                        <p className="text-xs text-muted-foreground mt-2 italic">
                          Alt: {slide.alt_text}
                        </p>
                      )}
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 border-2 border-dashed border-muted-foreground/25 rounded-lg bg-muted/10">
                    <AlertTriangle className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium">No Slides Generated</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      This story has no slides. There may have been an error during generation.
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}

        {stories.length === 0 && (
          <Card>
            <CardContent className="p-12 text-center">
              <Sparkles className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-semibold mb-2">Queue Empty</h3>
              <p className="text-muted-foreground">
                No slides pending review. Add website sources to start generating content automatically.
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Slide Modal */}
      {editingSlide && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-2xl mx-4">
            <CardHeader>
              <CardTitle>Edit Slide {editingSlide.slide_number}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                rows={6}
                placeholder="Slide content..."
              />
              
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Word count: {editContent.trim().split(/\s+/).filter(w => w).length}
                </div>
                
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingSlide(null)}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveSlide}>
                    Save Changes
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};