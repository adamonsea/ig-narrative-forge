import { useInfiniteTopicFeed } from "@/hooks/useInfiniteTopicFeed";
import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useRef, useEffect } from "react";

export default function EastbourneFeed() {
  const { user } = useAuth();
  const { 
    stories, 
    topic, 
    loading, 
    loadingMore, 
    hasMore, 
    sortBy, 
    setSortBy, 
    loadMore 
  } = useInfiniteTopicFeed('eastbourne');

  // Intersection observer for infinite scroll
  const loadMoreRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting && hasMore && !loadingMore && !loading) {
          loadMore();
        }
      },
      {
        threshold: 0.1,
        rootMargin: '100px'
      }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => {
      if (loadMoreRef.current) {
        observer.unobserve(loadMoreRef.current);
      }
    };
  }, [hasMore, loadingMore, loading, loadMore]);

  if (loading && stories.length === 0) {
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
            sortBy={sortBy}
            setSortBy={setSortBy}
            slideCount={stories.reduce((total, story) => total + (story.slides?.length || 0), 0)}
          />
        </div>
      </header>

      {/* Feed */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {stories.length > 0 ? (
          <div className="space-y-8">
            {stories.map((story) => (
              <StoryCarousel 
                key={story.id} 
                story={story} 
                topicName={topic?.name || "Eastbourne"}
                storyUrl={`${window.location.origin}/eastbourne-feed/story/${story.id}`}
              />
            ))}
            
            {/* Infinite scroll trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="flex justify-center py-8">
                {loadingMore ? (
                  <div className="text-center">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                    <p className="text-sm text-muted-foreground">Loading more stories...</p>
                  </div>
                ) : (
                  <div className="h-20" />
                )}
              </div>
            )}
          </div>
        ) : !loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">No stories found for Eastbourne</p>
            <p className="text-sm text-muted-foreground mt-2">
              Try adjusting your filters or check back later
            </p>
          </div>
        ) : null}
      </div>
    </div>
  );
}