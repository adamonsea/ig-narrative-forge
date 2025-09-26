import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useInfiniteTopicFeed } from "@/hooks/useInfiniteTopicFeed";
import { EndOfFeedCTA } from "@/components/EndOfFeedCTA";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";

export default function EastbourneFeed() {
  const { user } = useAuth();
  
  // Track visitor stats for Eastbourne topic
  useVisitorTracking('d224e606-1a4c-4713-8135-1d30e2d6d0c6');
  
  const {
    stories,
    topic,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    refresh
  } = useInfiniteTopicFeed('eastbourne');

  // Handle load more with intersection observer
  const handleLoadMore = () => {
    if (!loadingMore && hasMore) {
      loadMore();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading Eastbourne stories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="relative max-w-2xl mx-auto px-4 py-6 text-center">
          {/* User Avatar for logged in users */}
          {user && (
            <div className="absolute left-4 top-6">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                  {user.email?.charAt(0).toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          )}
          
          <div className="flex items-center gap-2 justify-center mb-2">
            <h1 className="text-2xl font-bold text-primary">Eastbourne</h1>
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
              beta
            </span>
          </div>
          <FeedFilters
            slideCount={stories.reduce((total, story) => total + story.slides.length, 0)}
          />
        </div>
      </header>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {stories.length > 0 ? (
          <div className="space-y-8">
            {stories.map((story, index) => {
              const isLast = index === stories.length - 1;
              return (
                <div 
                  key={story.id}
                  ref={isLast && hasMore ? (el) => {
                    if (el) {
                      const observer = new IntersectionObserver(
                        (entries) => {
                          if (entries[0].isIntersecting) {
                            handleLoadMore();
                            observer.disconnect();
                          }
                        },
                        { threshold: 0.1 }
                      );
                      observer.observe(el);
                    }
                  } : undefined}
                >
                  <StoryCarousel 
                    story={story} 
                    storyUrl={`${window.location.origin}/eastbourne-feed/story/${story.id}`}
                    topicId="d224e606-1a4c-4713-8135-1d30e2d6d0c6"
                  />
                </div>
              );
            })}
            
            {/* Loading more indicator */}
            {loadingMore && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            )}
            
            {/* End of feed */}
            {!hasMore && stories.length > 0 && (
              <EndOfFeedCTA 
                topicName={topic?.name || "Eastbourne"}
                topicId={topic?.id || "d224e606-1a4c-4713-8135-1d30e2d6d0c6"}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No stories found for Eastbourne</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your filters or check back later
            </p>
          </div>
        )}
      </div>
    </div>
  );
}