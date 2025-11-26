import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { PageTurnCard } from '@/components/swipe-mode/PageTurnCard';
import { SwipeModeAuth } from '@/components/swipe-mode/SwipeModeAuth';
import { LikedStoriesDrawer } from '@/components/swipe-mode/LikedStoriesDrawer';
import { SwipeModeHint } from '@/components/swipe-mode/SwipeModeHint';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { SwipeCarousel } from '@/components/ui/swipe-carousel';
import { ArrowLeft, Heart, RotateCcw, Loader2, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function SwipeMode() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicName, setTopicName] = useState<string>('');
  const [showAuth, setShowAuth] = useState(false);
  const [showLiked, setShowLiked] = useState(false);
  const [fullStoryOpen, setFullStoryOpen] = useState(false);
  const [loadingTopic, setLoadingTopic] = useState(true);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);

  const { currentStory, hasMoreStories, loading, stats, recordSwipe, fetchLikedStories, refetch, resetSwipes, stories, currentIndex } = useSwipeMode(topicId || '');

  // Expose reset function for testing (accessible via window.resetSwipes())
  useEffect(() => {
    if (resetSwipes) {
      (window as any).resetSwipes = resetSwipes;
    }
    return () => {
      delete (window as any).resetSwipes;
    };
  }, [resetSwipes]);

  // Fetch topic data
  useEffect(() => {
    const fetchTopic = async () => {
      if (!slug) return;

      const { data, error } = await supabase
        .from('topics')
        .select('id, name')
        .eq('slug', slug)
        .eq('is_archived', false)
        .single();

      if (error || !data) {
        toast.error('Topic not found');
        navigate('/');
        return;
      }

      setTopicId(data.id);
      setTopicName(data.name);
      setLoadingTopic(false);
    };

    fetchTopic();
  }, [slug, navigate]);

  // Check auth on mount
  useEffect(() => {
    if (!loadingTopic && !user) {
      setShowAuth(true);
    }
  }, [user, loadingTopic]);

  const handleSwipe = async (direction: 'like' | 'discard') => {
    if (!currentStory) return;
    setExitDirection(direction === 'like' ? 'right' : 'left');
    // Small delay to let animation start before recording swipe
    setTimeout(() => {
      recordSwipe(currentStory.id, direction);
      setExitDirection(null);
    }, 100);
  };

  const handleCardTap = () => {
    setFullStoryOpen(true);
  };

  const sourceDomain = currentStory?.article?.source_url 
    ? new URL(currentStory.article.source_url).hostname.replace('www.', '')
    : null;

  if (loadingTopic) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/feed/${slug}`)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Exit
          </Button>

          <div className="flex items-center gap-2">
            <Badge variant="outline">{stats.remainingCount} left</Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={resetSwipes}
              className="gap-2"
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLiked(true)}
              className="gap-2"
            >
              <Heart className="w-4 h-4 fill-primary text-primary" />
              {stats.likeCount}
            </Button>
          </div>
        </div>
      </header>

      {/* Main Swipe Area */}
      <main className="flex-1 container max-w-lg mx-auto px-4 py-8 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !hasMoreStories ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <Heart className="w-24 h-24 text-muted-foreground" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">You're all caught up!</h2>
              <p className="text-muted-foreground">
                You've seen all the stories in {topicName}
              </p>
            </div>
            <div className="flex gap-3">
              <Button onClick={refetch} variant="outline" className="gap-2">
                <RotateCcw className="w-4 h-4" />
                Refresh
              </Button>
              <Button onClick={() => setShowLiked(true)} className="gap-2">
                <Heart className="w-4 h-4" />
                View Liked ({stats.likeCount})
              </Button>
            </div>
          </div>
        ) : currentStory ? (
          <div className="relative h-[600px]">
            {/* Swipe hint animation */}
            <SwipeModeHint />
            
            {/* Stack effect: cards behind current card */}
            <div className="absolute inset-0 pointer-events-none">
              <div 
                className="absolute inset-0 bg-card border rounded-lg shadow-sm"
                style={{ 
                  transform: 'scale(0.95) translateY(10px)',
                  opacity: 0.5,
                  zIndex: -2
                }}
              />
              <div 
                className="absolute inset-0 bg-card border rounded-lg shadow"
                style={{ 
                  transform: 'scale(0.97) translateY(5px)',
                  opacity: 0.7,
                  zIndex: -1
                }}
              />
            </div>
            
            {/* Preload next card image */}
            {stories[currentIndex + 1]?.cover_illustration_url && (
              <link 
                rel="preload" 
                as="image" 
                href={stories[currentIndex + 1].cover_illustration_url} 
              />
            )}
            
            {/* Current card with animation */}
            <AnimatePresence mode="wait">
              <PageTurnCard
                key={currentStory.id}
                story={currentStory}
                onSwipe={handleSwipe}
                onTap={handleCardTap}
                exitDirection={exitDirection}
              />
            </AnimatePresence>
          </div>
        ) : null}
      </main>

      {/* Auth Modal */}
      {slug && (
        <SwipeModeAuth 
          open={showAuth} 
          onOpenChange={setShowAuth}
          topicSlug={slug}
        />
      )}

      {/* Liked Stories Drawer */}
      {slug && (
        <LikedStoriesDrawer
          open={showLiked}
          onOpenChange={setShowLiked}
          topicSlug={slug}
          fetchLikedStories={fetchLikedStories}
        />
      )}

      {/* Full Story Modal */}
      {currentStory && (
        <Dialog open={fullStoryOpen} onOpenChange={setFullStoryOpen}>
          <DialogContent className="max-w-4xl h-[90vh] overflow-hidden">
            <div className="h-full overflow-y-auto">
              {/* Cover Image */}
              {currentStory.cover_illustration_url && (
                <div className="w-full aspect-video overflow-hidden bg-muted">
                  <img
                    src={currentStory.cover_illustration_url}
                    alt={currentStory.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              {/* Story Content */}
              <div className="p-6 space-y-4">
                {/* All slides */}
                {currentStory.slides
                  ?.sort((a, b) => a.slide_number - b.slide_number)
                  .map(slide => (
                    <div key={slide.slide_number} className="prose prose-sm max-w-none">
                      <div dangerouslySetInnerHTML={{ __html: slide.content }} />
                    </div>
                  ))}
                
                {/* Source Link */}
                {currentStory.article?.source_url && (
                  <div className="pt-4 border-t">
                    <a
                      href={currentStory.article.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline"
                    >
                      <ExternalLink className="w-4 h-4" />
                      Read original story at {sourceDomain}
                    </a>
                  </div>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
