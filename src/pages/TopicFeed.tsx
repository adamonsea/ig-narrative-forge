import { useParams } from "react-router-dom";
import { useEffect, useRef, useCallback } from "react";
import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { EndOfFeedCTA } from "@/components/EndOfFeedCTA";
import { Skeleton } from "@/components/ui/skeleton";
import { useInfiniteTopicFeed } from "@/hooks/useInfiniteTopicFeed";
import { useSentimentCards } from "@/hooks/useSentimentCards";
import { SentimentCard } from "@/components/SentimentCard";
import { Hash, MapPin, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const TopicFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);

  const {
    stories,
    topic,
    loading,
    loadingMore,
    hasMore,
    sortBy,
    setSortBy,
    loadMore
  } = useInfiniteTopicFeed(slug || '');

  const { sentimentCards } = useSentimentCards(topic?.id);

  // Intersection Observer for infinite scroll
  const lastStoryElementRef = useCallback((node: HTMLDivElement | null) => {
    if (loading || loadingMore) return;
    if (observerRef.current) observerRef.current.disconnect();
    
    observerRef.current = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && hasMore) {
        loadMore();
      }
    }, {
      threshold: 0.1,
      rootMargin: '100px'
    });
    
    if (node) observerRef.current.observe(node);
  }, [loading, loadingMore, hasMore, loadMore]);

  useEffect(() => {
    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          {/* Loading skeleton for header */}
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-4">
              <Skeleton className="w-6 h-6 rounded-full" />
              <Skeleton className="w-64 h-10" />
            </div>
          </div>
          
          {/* Loading skeleton for filters */}
          <div className="mb-8">
            <Skeleton className="w-full h-12" />
          </div>
          
          {/* Loading skeleton for stories */}
          <div className="space-y-8">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="w-full h-96 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Topic Not Found</h1>
            <p className="text-muted-foreground">
              The topic you're looking for doesn't exist or has been deactivated.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
      <div className="container mx-auto px-4 py-8">
        {/* Topic Header - Clean and minimal */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              asChild
              className="absolute left-4 top-8"
            >
              <a href="/dashboard">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </a>
            </Button>
            {topic.topic_type === 'regional' ? (
              <MapPin className="w-6 h-6 text-blue-500" />
            ) : (
              <Hash className="w-6 h-6 text-green-500" />
            )}
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {topic.name}
            </h1>
          </div>
          {topic.description && (
            <p className="text-muted-foreground max-w-2xl mx-auto">
              {topic.description}
            </p>
          )}
        </div>

        {/* Filters */}
        <div className="mb-8">
          <FeedFilters 
            sortBy={sortBy} 
            setSortBy={setSortBy}
            slideCount={stories.reduce((total, story) => total + story.slides.length, 0)}
          />
        </div>

        {/* Stories with infinite scroll - mixed with sentiment cards */}
        {stories.length > 0 ? (
          <div className="space-y-6 md:space-y-8 flex flex-col items-center">
            {stories.map((story, index) => {
              const items = [];
              
              // Add the story
              items.push(
                <div
                  key={`story-${story.id}`}
                  ref={index === stories.length - 1 ? lastStoryElementRef : null}
                >
                  <StoryCarousel 
                    story={story} 
                    topicName={topic.name}
                    storyUrl={`${window.location.origin}/feed/topic/${slug}/story/${story.id}`}
                  />
                </div>
              );

              // Add sentiment card every 6 stories
              if ((index + 1) % 6 === 0 && sentimentCards.length > 0) {
                const sentimentIndex = Math.floor(index / 6) % sentimentCards.length;
                const sentimentCard = sentimentCards[sentimentIndex];
                
                items.push(
                  <div key={`sentiment-${sentimentCard.id}-${index}`}>
                    <SentimentCard
                      id={sentimentCard.id}
                      keywordPhrase={sentimentCard.keyword_phrase}
                      content={sentimentCard.content}
                      sources={sentimentCard.sources}
                      sentimentScore={sentimentCard.sentiment_score}
                      confidenceScore={sentimentCard.confidence_score}
                      analysisDate={sentimentCard.analysis_date}
                      cardType={sentimentCard.card_type as 'quote' | 'trend' | 'comparison' | 'timeline'}
                      slides={sentimentCard.slides}
                    />
                  </div>
                );
              }

              return items;
            }).flat()}
            
            {/* Loading more indicator */}
            {loadingMore && (
              <div className="space-y-8">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="w-full h-96 rounded-lg" />
                ))}
              </div>
            )}
            
            {/* End of feed CTA */}
            {!hasMore && !loadingMore && (
              <div className="pt-8">
                <EndOfFeedCTA topicName={topic.name} topicId={topic.id} />
              </div>
            )}
          </div>
        ) : (
          <div className="pt-8">
            <EndOfFeedCTA topicName={topic.name} topicId={topic.id} />
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicFeed;