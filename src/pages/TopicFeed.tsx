import { useParams } from "react-router-dom";
import { useEffect, useRef, useCallback, useState } from "react";
import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { EndOfFeedCTA } from "@/components/EndOfFeedCTA";
import { Skeleton } from "@/components/ui/skeleton";
import { useSentimentCards } from "@/hooks/useSentimentCards";
import { useHybridTopicFeedWithKeywords } from "@/hooks/useHybridTopicFeedWithKeywords";
import { SentimentCard } from "@/components/SentimentCard";
import { EventsAccordion } from "@/components/EventsAccordion";
import { KeywordFilterModal } from "@/components/KeywordFilterModal";
import { Hash, MapPin, Filter } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";

const TopicFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);

  const {
    stories: filteredStories,
    topic,
    loading,
    loadingMore,
    hasMore,
    loadMore,
    selectedKeywords,
    availableKeywords,
    isModalOpen,
    setIsModalOpen,
    toggleKeyword,
    clearAllFilters,
    removeKeyword,
    hasActiveFilters,
    isServerFiltering
  } = useHybridTopicFeedWithKeywords(slug || '');

  const { sentimentCards } = useSentimentCards(topic?.id);

  // Track visitor stats
  useVisitorTracking(topic?.id);

  // Scroll detection for sticky header
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 200);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
              The topic you're looking for doesn't exist, has been deactivated, or is not publicly available.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
      {/* Sticky header for scrollers */}
      {isScrolled && topic && (
        <div className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {topic.branding_config?.logo_url ? (
                  <img
                    src={topic.branding_config.logo_url}
                    alt={`${topic.name} logo`}
                    className="h-8 w-auto object-contain"
                  />
                ) : (
                  <div className="flex items-center gap-2">
                    {topic.topic_type === 'regional' ? (
                      <MapPin className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Hash className="w-4 h-4 text-green-500" />
                    )}
                    <span className="font-semibold text-lg">{topic.name}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
              >
                <Filter className="w-4 h-4" />
                <span className="text-sm font-medium">Filters</span>
                {hasActiveFilters && (
                  <span className="w-2 h-2 bg-primary rounded-full" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={`container mx-auto px-4 py-8 ${isScrolled ? 'pt-20' : ''}`}>
        {/* User Avatar for logged in users */}
        {user && (
          <div className="absolute left-4 top-8">
            <Avatar className="w-8 h-8">
              <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        )}

        {/* Topic Header - Clean and minimal with branding support */}
        <div className="text-center mb-8">
          <div className="relative flex items-center justify-center mb-4">
            {/* Centered logo or title */}
            {topic.branding_config?.logo_url ? (
              <div className="flex justify-center">
                <img
                  src={topic.branding_config.logo_url}
                  alt={`${topic.name} logo`}
                  className="h-12 sm:h-16 max-w-[280px] sm:max-w-xs object-contain"
                />
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {topic.topic_type === 'regional' ? (
                  <MapPin className="w-6 h-6 text-blue-500" />
                ) : (
                  <Hash className="w-6 h-6 text-green-500" />
                )}
                <h1 className="text-2xl sm:text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                  {topic.name}
                </h1>
              </div>
            )}
            
            <span className="absolute right-0 top-0 text-xs font-semibold px-2 py-1 rounded-full bg-muted text-muted-foreground">
              beta
            </span>
          </div>
          {topic.branding_config?.subheader ? (
            <p className="text-muted-foreground max-w-2xl mx-auto text-center px-4">
              {topic.branding_config.subheader}
            </p>
          ) : topic.description ? (
            <p className="text-muted-foreground max-w-2xl mx-auto text-center px-4">
              {topic.description}
            </p>
          ) : null}
        </div>

        {/* Filters */}
        <div className="mb-8">
          <FeedFilters 
            slideCount={filteredStories.reduce((total, story) => total + story.slides.length, 0)}
            onFilterClick={() => setIsModalOpen(true)}
            selectedKeywords={selectedKeywords}
            onRemoveKeyword={removeKeyword}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {/* Keyword Filter Modal */}
        <KeywordFilterModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          availableKeywords={availableKeywords}
          selectedKeywords={selectedKeywords}
          onKeywordToggle={toggleKeyword}
          onClearAll={clearAllFilters}
        />

        {/* Stories with infinite scroll - mixed with sentiment cards */}
        {filteredStories.length > 0 ? (
          <div className="space-y-6 md:space-y-8 flex flex-col items-center">
            {filteredStories.map((story, index) => {
              const items = [];
              
              // Add the story
              items.push(
                <div
                  key={`story-${story.id}`}
                  ref={index === filteredStories.length - 1 ? lastStoryElementRef : null}
                >
                  <StoryCarousel 
                    story={story} 
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

              // Add events accordion every 10 stories
              if ((index + 1) % 10 === 0 && topic?.id) {
                items.push(
                  <div key={`events-${index}`} className="w-full max-w-2xl">
                    <EventsAccordion 
                      topicId={topic.id} 
                      isOwner={false}
                    />
                  </div>
                );
              }

              return items;
            }).flat()}
            
            {/* Loading more indicator */}
            {(loadingMore || isServerFiltering) && (
              <div className="space-y-8">
                {[...Array(2)].map((_, i) => (
                  <Skeleton key={i} className="w-full h-96 rounded-lg" />
                ))}
                {isServerFiltering && (
                  <div className="text-center text-sm text-muted-foreground">
                    Filtering stories...
                  </div>
                )}
              </div>
            )}
            
            {/* End of feed CTA */}
            {!hasMore && !loadingMore && (
              <div className="pt-8">
                <EndOfFeedCTA topicName={topic.name} topicId={topic.id} />
              </div>
            )}
          </div>
        ) : hasActiveFilters ? (
          <div className="text-center py-12 space-y-4">
            <Hash className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-semibold mb-2">No stories match your filters</h3>
              <p className="text-muted-foreground mb-4">
                Try removing some keywords or adjusting your filters
              </p>
              <button
                onClick={clearAllFilters}
                className="text-primary hover:underline"
              >
                Clear all filters
              </button>
            </div>
          </div>
        ) : !loading && !loadingMore ? (
          <div className="text-center py-12 space-y-4">
            <Hash className="w-12 h-12 mx-auto text-muted-foreground/50" />
            <div>
              <h3 className="text-lg font-semibold mb-2">No stories yet</h3>
              <p className="text-muted-foreground mb-4">
                This feed doesn't have any published content yet. Check back soon for fresh stories!
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};

export default TopicFeed;