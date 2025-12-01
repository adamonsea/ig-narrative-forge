import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useSwipeMode } from '@/hooks/useSwipeMode';
import { useDeviceOptimizations } from '@/lib/deviceUtils';
import { useTopicFavicon } from '@/hooks/useTopicFavicon';
import { usePlayModeVisitorTracking } from '@/hooks/usePlayModeVisitorTracking';
import { PageTurnCard } from '@/components/swipe-mode/PageTurnCard';
import { SwipeModeAuth } from '@/components/swipe-mode/SwipeModeAuth';
import { LikedStoriesDrawer } from '@/components/swipe-mode/LikedStoriesDrawer';
import { SwipeModeHint } from '@/components/swipe-mode/SwipeModeHint';
import { SwipeInsightsDrawer } from '@/components/swipe-mode/SwipeInsightsDrawer';
import { StoryRatingCard } from '@/components/swipe-mode/StoryRatingCard';
import { ProgressRing } from '@/components/swipe-mode/ProgressRing';
import { StreakIndicator } from '@/components/swipe-mode/StreakIndicator';
import { MilestoneCelebration } from '@/components/swipe-mode/MilestoneCelebration';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { ArrowLeft, Heart, Loader2, ExternalLink, Trophy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type AuthVariant = 'curiosity' | 'agency' | 'belonging';

// Progressive CTA thresholds
const FIRST_TRIGGER = 3;
const SECOND_TRIGGER = 13;
const THIRD_TRIGGER = 23;
const MAX_DISMISSALS = 3;

export default function SwipeMode() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicName, setTopicName] = useState<string>('');
  const [topicBranding, setTopicBranding] = useState<any>(null);
  const [showAuth, setShowAuth] = useState(false);
  const [showLiked, setShowLiked] = useState(false);
  const [fullStoryOpen, setFullStoryOpen] = useState(false);
  const [loadingTopic, setLoadingTopic] = useState(true);
  const [exitDirection, setExitDirection] = useState<'left' | 'right' | null>(null);

  // Progressive auth state
  const [anonymousSwipeCount, setAnonymousSwipeCount] = useState(0);
  const [dismissCount, setDismissCount] = useState(0);
  const [authVariant, setAuthVariant] = useState<AuthVariant>('curiosity');

  const { currentStory, hasMoreStories, loading, stats, recordSwipe, fetchLikedStories, refetch, stories, currentIndex } = useSwipeMode(topicId || '');
  const optimizations = useDeviceOptimizations();
  const [previousStreak, setPreviousStreak] = useState(0);
  
  // Apply topic favicon
  const faviconUrl = topicBranding?.icon_url || topicBranding?.logo_url;
  useTopicFavicon(faviconUrl);
  
  // Track Play Mode visitor (even anonymous)
  usePlayModeVisitorTracking(topicId || undefined);

  // Fetch topic data
  useEffect(() => {
    const fetchTopic = async () => {
      if (!slug) return;

      const { data, error } = await supabase
        .from('topics')
        .select('id, name, branding_config')
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
      setTopicBranding(data.branding_config);
      setLoadingTopic(false);
    };

    fetchTopic();
  }, [slug, navigate]);

  // Check if we should show auth modal based on swipe count
  const checkProgressiveTrigger = (newCount: number) => {
    if (user || dismissCount >= MAX_DISMISSALS) return;

    if (newCount === FIRST_TRIGGER && dismissCount === 0) {
      setAuthVariant('curiosity');
      setShowAuth(true);
    } else if (newCount === SECOND_TRIGGER && dismissCount === 1) {
      setAuthVariant('agency');
      setShowAuth(true);
    } else if (newCount === THIRD_TRIGGER && dismissCount === 2) {
      setAuthVariant('belonging');
      setShowAuth(true);
    }
  };

  const handleSwipe = async (direction: 'like' | 'discard') => {
    if (!currentStory) return;
    setExitDirection(direction === 'like' ? 'right' : 'left');
    
    setPreviousStreak(stats.currentStreak);
    
    setTimeout(() => {
      if (user) {
        // Authenticated: persist to database
        recordSwipe(currentStory.id, direction);
      } else {
        // Anonymous: just advance locally (recordSwipe handles this)
        recordSwipe(currentStory.id, direction);
        
        // Track anonymous swipes for progressive CTA
        const newCount = anonymousSwipeCount + 1;
        setAnonymousSwipeCount(newCount);
        checkProgressiveTrigger(newCount);
      }
      setExitDirection(null);
    }, 100);
  };

  const handleAuthClose = (open: boolean) => {
    setShowAuth(open);
    if (!open && !user) {
      // User dismissed modal without registering
      setDismissCount(prev => prev + 1);
    }
  };

  const handleCardTap = () => {
    setFullStoryOpen(true);
  };

  const sourceDomain = (() => {
    try {
      return currentStory?.article?.source_url 
        ? new URL(currentStory.article.source_url).hostname.replace('www.', '')
        : null;
    } catch {
      return null; // Gracefully handle malformed URLs
    }
  })();

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
            {/* Gate SwipeInsightsDrawer behind auth */}
            {topicId && user && (
              <SwipeInsightsDrawer topicId={topicId} topicName={topicName} />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                refetch();
                toast.success('Checking for new stories...');
              }}
              disabled={loading}
              className="gap-1"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Refresh'}
            </Button>
            
            {/* Progress ring instead of text badge */}
            <ProgressRing current={stats.remainingCount} total={stats.totalSwipes + stats.remainingCount} />
            
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

      {/* Streak encouragement (floating, centered) */}
      <StreakIndicator streak={stats.currentStreak} previousStreak={previousStreak} />
      
      {/* Milestone celebration overlay */}
      <MilestoneCelebration swipeCount={stats.totalSwipes} />

      {/* Main Swipe Area */}
      <main className="flex-1 container max-w-lg mx-auto px-4 py-8 relative">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : !hasMoreStories ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
            <Trophy className="w-24 h-24 text-primary" />
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold">All caught up! 🎉</h2>
              <p className="text-muted-foreground">
                You've swiped through all {stats.totalSwipes} stories in {topicName}
              </p>
            </div>
            
            {/* Session stats summary */}
            <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
              <div className="bg-card border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-primary">{stats.likeCount}</div>
                <div className="text-xs text-muted-foreground">Liked</div>
              </div>
              <div className="bg-card border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-muted-foreground">{stats.discardCount}</div>
                <div className="text-xs text-muted-foreground">Skipped</div>
              </div>
              <div className="bg-card border rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-orange-500">{stats.currentStreak}</div>
                <div className="text-xs text-muted-foreground">Streak</div>
              </div>
            </div>
            
            <div className="flex flex-col gap-3">
              <Button onClick={() => setShowLiked(true)} className="gap-2">
                <Heart className="w-4 h-4" />
                View Liked Stories
              </Button>
              <Button variant="outline" onClick={() => navigate(`/feed/${slug}`)}>
                Back to Feed
              </Button>
            </div>
          </div>
        ) : currentStory ? (
          <div className="relative h-[600px]" style={{ zIndex: 1 }}>
            {/* Swipe hint animation */}
            <SwipeModeHint />
            
            {/* Show lightweight static preview underneath (if next story exists) */}
            {stories[currentIndex + 1] && (
              <>
                {/* Next card preview - static, lightweight */}
                <div 
                  className="absolute inset-0 rounded-lg overflow-hidden bg-card border shadow-sm"
                  style={{ 
                    transform: 'scale(0.95) translateY(8px)',
                    opacity: 0.7,
                    zIndex: 0,
                    filter: optimizations.shouldReduceMotion ? 'none' : 'blur(1px)',
                  }}
                >
                  {/* Static preview - just image and skeleton, not full PageTurnCard */}
                  {stories[currentIndex + 1].cover_illustration_url && (
                    <div className="w-full aspect-[4/3] bg-muted overflow-hidden">
                      <img 
                        src={stories[currentIndex + 1].cover_illustration_url}
                        alt=""
                        className="w-full h-full object-cover opacity-80"
                        loading="lazy"
                      />
                    </div>
                  )}
                  <div className="p-4 space-y-2">
                    <div className="h-8 bg-muted rounded w-3/4" />
                    <div className="h-4 bg-muted rounded w-1/2" />
                  </div>
                </div>
                
                {/* Placeholder card behind next */}
                <div 
                  className="absolute inset-0 bg-card border rounded-lg shadow-sm"
                  style={{ 
                    transform: 'scale(0.92) translateY(14px)',
                    opacity: 0.4,
                    zIndex: -1
                  }}
                />
              </>
            )}
            
            {/* Preload next card image */}
            {stories[currentIndex + 1]?.cover_illustration_url && (
              <link 
                rel="preload" 
                as="image" 
                href={stories[currentIndex + 1].cover_illustration_url} 
              />
            )}
            
            {/* Current card with animation - highest z-index */}
            <AnimatePresence mode="wait">
              <PageTurnCard
                key={currentStory.id}
                story={currentStory}
                onSwipe={handleSwipe}
                onTap={handleCardTap}
                exitDirection={exitDirection}
                style={{ zIndex: 10 }}
              />
            </AnimatePresence>
          </div>
        ) : null}
      </main>

      {/* Auth Modal with progressive variant */}
      {slug && (
        <SwipeModeAuth 
          open={showAuth} 
          onOpenChange={handleAuthClose}
          topicSlug={slug}
          variant={authVariant}
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
          <DialogContent className="max-w-4xl h-[90vh] overflow-hidden p-0 flex flex-col">
            {/* Close button - prominent at top */}
            <Button
              onClick={() => setFullStoryOpen(false)}
              variant="ghost"
              size="sm"
              className="absolute top-4 right-4 z-50 gap-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
              Close ✕
            </Button>

            <div className="flex-1 overflow-y-auto pb-24">
              {/* Cover Image */}
              {currentStory.cover_illustration_url && (
                <div className="w-full aspect-[21/9] md:aspect-video overflow-hidden bg-muted">
                  <img
                    src={currentStory.cover_illustration_url}
                    alt={currentStory.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              
              {/* Story Content - more padding, larger text */}
              <div className="p-6 md:p-8 space-y-6">
                {/* Source pill at top */}
                {sourceDomain && currentStory.article?.source_url && (
                  <a 
                    href={currentStory.article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex"
                  >
                    <Badge variant="secondary" className="text-xs hover:bg-secondary/80 cursor-pointer">
                      <ExternalLink className="w-3 h-3 mr-1" />
                      {sourceDomain}
                    </Badge>
                  </a>
                )}
                
                {currentStory.slides && currentStory.slides.length > 0 ? (
                  currentStory.slides
                    .sort((a, b) => a.slide_number - b.slide_number)
                    .map(slide => (
                      <div 
                        key={slide.slide_number} 
                        className="text-foreground"
                        style={{ color: 'hsl(var(--foreground))' }}
                      >
                        <div 
                          className="prose prose-lg md:prose-xl max-w-none"
                          style={{ 
                            color: 'hsl(var(--foreground))',
                            '--tw-prose-body': 'hsl(var(--foreground))',
                            '--tw-prose-headings': 'hsl(var(--foreground))',
                            '--tw-prose-bold': 'hsl(var(--foreground))',
                            '--tw-prose-links': 'hsl(var(--primary))',
                          } as React.CSSProperties}
                          dangerouslySetInnerHTML={{ __html: slide.content }} 
                        />
                      </div>
                    ))
                ) : (
                  <div className="p-8 text-center space-y-4">
                    <p className="text-muted-foreground">Story content couldn't be loaded.</p>
                    {currentStory.article?.source_url && (
                      <Button asChild variant="outline">
                        <a
                          href={currentStory.article.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-2"
                        >
                          <ExternalLink className="w-4 h-4" />
                          View Original Source
                        </a>
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            {/* Prominent CTAs - Fixed at bottom */}
            <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-background border-t shadow-lg z-50">
              <div className="space-y-3">
                {/* Gate StoryRatingCard behind auth */}
                {user && <StoryRatingCard storyId={currentStory.id} />}
                
                {/* Two CTA buttons side by side */}
                <div className="flex gap-3">
                  <Button
                    asChild
                    size="lg"
                    className="flex-1 gap-2 text-base font-semibold"
                  >
                    <a href={`/feed/${slug}/story/${currentStory.id}`}>
                      Slides
                    </a>
                  </Button>

                  {currentStory.article?.source_url ? (
                    <Button
                      asChild
                      size="lg"
                      variant="outline"
                      className="flex-1 gap-2 text-base"
                    >
                      <a
                        href={currentStory.article.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Source
                      </a>
                    </Button>
                  ) : (
                    <Button
                      size="lg"
                      variant="outline"
                      className="flex-1 gap-2 text-base"
                      disabled
                    >
                      <ExternalLink className="w-4 h-4" />
                      Source
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
