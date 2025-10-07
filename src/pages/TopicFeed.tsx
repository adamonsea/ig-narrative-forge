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
import { FilterModal } from "@/components/FilterModal";
import { Hash, MapPin, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useVisitorTracking } from "@/hooks/useVisitorTracking";
import { TopicFeedSEO } from "@/components/seo/TopicFeedSEO";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { supabase } from "@/integrations/supabase/client";
import { useStoryNotifications } from "@/hooks/useStoryNotifications";

const TopicFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const { user } = useAuth();
  const observerRef = useRef<IntersectionObserver | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [showFilterTip, setShowFilterTip] = useState(false);
  const [monthlyCount, setMonthlyCount] = useState<number | null>(null);

  useEffect(() => {
    const dismissed = localStorage.getItem('eezee_filter_tip_dismissed');
    setShowFilterTip(!dismissed);
  }, []);

  const openFilterAndDismissTip = () => {
    localStorage.setItem('eezee_filter_tip_dismissed', '1');
    setShowFilterTip(false);
    setIsModalOpen(true);
  };


  const {
    stories: filteredStories,
    content: filteredContent,
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
    isServerFiltering,
    selectedSources,
    availableSources,
    toggleSource,
    removeSource
  } = useHybridTopicFeedWithKeywords(slug || '');

  // Fetch monthly count after we have topic
  useEffect(() => {
    let active = true;
    const fetchMonthlyCount = async () => {
      if (!topic?.id || !slug) return;
      
      try {
        const start = new Date();
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
        
        // Use simpler RPC call to avoid TypeScript inference issues
        const { data, error } = await supabase.rpc('get_topic_stories_with_keywords', {
          p_topic_slug: (slug)?.toLowerCase(),
          p_keywords: null,
          p_sources: null,
          p_limit: 500,
          p_offset: 0
        });
        
        if (error) {
          console.warn('Monthly count error:', error);
          return;
        }
        
        // Count unique stories published this month
        const storyMap = new Map<string, any>();
        (data || []).forEach((row: any) => {
          if (!storyMap.has(row.story_id)) {
            storyMap.set(row.story_id, row);
          }
        });
        
        const count = Array.from(storyMap.values()).filter((row: any) => {
          const d = row.story_created_at ? new Date(row.story_created_at) : null;
          return d && d >= start;
        }).length;
        
        if (active) setMonthlyCount(count);
      } catch (e) {
        console.warn('Monthly count fetch failed:', e);
      }
    };
    
    fetchMonthlyCount();
    return () => { active = false };
  }, [topic?.id, slug]);

  const { sentimentCards } = useSentimentCards(topic?.id);

  // Track visitor stats
  useVisitorTracking(topic?.id);

  // Enable browser notifications for new stories
  useStoryNotifications(topic?.id, topic?.name || '', slug);

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
      <div className="min-h-screen feed-background">
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
      <div className="min-h-screen feed-background">
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
    <div className="min-h-screen feed-background">
      {/* SEO Meta Tags */}
      <TopicFeedSEO
        topicName={topic.name}
        topicDescription={topic.branding_config?.subheader || topic.description}
        topicSlug={slug || ''}
        topicType={topic.topic_type}
        region={topic.region}
        logoUrl={topic.branding_config?.logo_url}
      />

      {/* Sticky header for scrollers */}
      {isScrolled && topic && (
        <div className="fixed top-0 left-0 right-0 z-50 feed-header backdrop-blur-sm border-b border-border">
          <div className="container mx-auto px-4 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {topic.branding_config?.logo_url ? (
                  <img
                    src={`${topic.branding_config.logo_url}?t=${Date.now()}`}
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
              <TooltipProvider>
                <Tooltip open={showFilterTip}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={openFilterAndDismissTip}
                      className="flex items-center gap-2 px-2 sm:px-3 py-2 rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    >
                      <Filter className="w-4 h-4" />
                      <span className="hidden sm:inline text-sm font-medium">Filters</span>
                      {hasActiveFilters && (
                        <span className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="end" className="z-[60] max-w-xs text-center">
                    <div className="font-semibold">{(monthlyCount ?? 0).toString()} this month, {topic.name}</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

            </div>
          </div>
        </div>
      )}

      {/* White banner header */}
      <div className="bg-background border-b border-border">
        <div className="container mx-auto px-1 md:px-4 py-12">
          {/* User Avatar for logged in users */}
          {user && (
            <div className="absolute left-4 top-4">
              <Avatar className="w-8 h-8">
                <AvatarFallback className="bg-primary text-primary-foreground text-sm font-medium">
                {user.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
              </Avatar>
            </div>
          )}

          {/* Topic Header - Clean and minimal with branding support */}
          <div className="text-center">
            <div className="relative flex items-center justify-center mb-4">
              {/* Centered logo or title */}
              {topic.branding_config?.logo_url ? (
                <div className="flex justify-center">
                  <img
                    src={`${topic.branding_config.logo_url}?t=${Date.now()}`}
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

            {/* Mobile filter button - centered below logo */}
            <div className="sm:hidden flex justify-center mb-4">
              <TooltipProvider>
                <Tooltip open={showFilterTip}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={openFilterAndDismissTip}
                      className="flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-muted hover:bg-muted/80 transition-colors"
                      aria-label="Open filters"
                    >
                      <Filter className="w-4 h-4" />
                      <span className="text-sm font-medium">Filter</span>
                      {hasActiveFilters && (
                        <span className="w-2 h-2 bg-primary rounded-full" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" align="center" className="z-[60] max-w-xs text-center">
                    <div className="font-semibold">{(monthlyCount ?? 0).toString()} this month, {topic.name}</div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            {topic.branding_config?.subheader ? (
              <p className="text-muted-foreground max-w-2xl mx-auto text-center px-1 md:px-4">
                {topic.branding_config.subheader}
              </p>
            ) : topic.description ? (
              <p className="text-muted-foreground max-w-2xl mx-auto text-center px-1 md:px-4">
                {topic.description}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className={`container mx-auto px-1 md:px-4 py-8 ${isScrolled ? 'pt-16' : ''}`}>

        {/* Filters - Hidden on mobile when filter button is in header */}
        <div className="mb-8 hidden sm:block">
          <FeedFilters 
            slideCount={filteredStories.reduce((total, story) => total + story.slides.length, 0)}
            monthlyCount={monthlyCount ?? undefined}
            topicName={topic.name}
            filteredStoryCount={filteredStories.length}
            onFilterClick={() => setIsModalOpen(true)}
            selectedKeywords={selectedKeywords}
            onRemoveKeyword={removeKeyword}
            selectedSources={selectedSources}
            onRemoveSource={removeSource}
            hasActiveFilters={hasActiveFilters}
          />
        </div>

        {/* Mobile-only selected filters display */}
        {(selectedKeywords.length > 0 || selectedSources.length > 0) && (
          <div className="mb-6 sm:hidden">
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="text-xs text-muted-foreground mb-2 w-full text-center">Filtering by:</span>
              {selectedKeywords.map((keyword) => (
                <Badge
                  key={`keyword-${keyword}`}
                  variant="secondary"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="capitalize">{keyword}</span>
                  <button
                    onClick={() => removeKeyword(keyword)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
              {selectedSources.map((source) => (
                <Badge
                  key={`source-${source}`}
                  variant="outline"
                  className="flex items-center gap-1 pr-1"
                >
                  <span className="capitalize">{source.split('.')[0]}</span>
                  <button
                    onClick={() => removeSource(source)}
                    className="ml-1 hover:bg-destructive/20 rounded-full p-0.5 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Filter Modal */}
        <FilterModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          availableKeywords={availableKeywords}
          selectedKeywords={selectedKeywords}
          onKeywordToggle={toggleKeyword}
          availableSources={availableSources}
          selectedSources={selectedSources}
          onSourceToggle={toggleSource}
          onClearAll={clearAllFilters}
        />

        {/* Content with infinite scroll - chronologically ordered stories and parliamentary mentions */}
        {!loading && !loadingMore && !isServerFiltering && filteredContent.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            {hasActiveFilters ? (
              <>
                <p className="text-lg text-muted-foreground">No stories match your selected filters</p>
                <p className="text-sm text-muted-foreground">Try adjusting your keyword or source selections</p>
              </>
            ) : (
              <>
                <p className="text-lg text-muted-foreground">No stories available yet</p>
                <p className="text-sm text-muted-foreground">Check back soon for new content</p>
              </>
            )}
          </div>
        ) : filteredContent.length > 0 ? (
          <div className="space-y-6 md:space-y-8 flex flex-col items-center">
            {(() => {
              // Defensive duplicate detection with console warning
              const seenIds = new Set<string>();
              const duplicates: string[] = [];
              
              filteredContent.forEach(item => {
                if (item?.id) {
                  if (seenIds.has(item.id)) {
                    duplicates.push(item.id.substring(0, 8));
                  } else {
                    seenIds.add(item.id);
                  }
                }
              });
              
              if (duplicates.length > 0) {
                console.warn(`⚠️ DUPLICATE CONTENT IDs IN FEED: ${duplicates.join(', ')}...`);
              }
              
              return filteredContent;
            })().map((contentItem, index) => {
              const items = [];
              
              if (contentItem.type === 'story') {
                const story = contentItem.data as any;
                // Generate universal story URL
                const storyShareUrl = `${window.location.origin}/feed/${slug}/story/${story.id}`;
                
                items.push(
                  <div
                    key={`story-${story.id}`}
                    ref={index === filteredContent.length - 1 ? lastStoryElementRef : null}
                  >
                    <StoryCarousel 
                      story={story} 
                      storyUrl={storyShareUrl}
                      topicId={topic?.id}
                      storyIndex={index}
                    />
                  </div>
                );
              }

              // Add sentiment card every 6 stories (count stories only)
              const storyIndex = filteredContent.slice(0, index + 1).filter(item => item.type === 'story').length;
              if (storyIndex % 6 === 0 && storyIndex > 0 && sentimentCards.length > 0) {
                const sentimentIndex = Math.floor((storyIndex - 1) / 6) % sentimentCards.length;
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

              // Add events accordion every 10 stories (count stories only)
              if (storyIndex % 10 === 0 && storyIndex > 0 && topic?.id) {
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