import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO } from "date-fns";
import StoryCarousel from "@/components/StoryCarousel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Filter, Share2, LayoutList } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { RoundupSEO } from "@/components/seo/RoundupSEO";
import { FilterModal } from "@/components/FilterModal";
import { FeedFilters } from "@/components/FeedFilters";
import { useToast } from "@/hooks/use-toast";

interface Topic {
  id: string;
  name: string;
  slug: string;
  branding_config?: any;
  keywords?: string[];
  landmarks?: string[];
  organizations?: string[];
}

interface Roundup {
  id: string;
  topic_id: string;
  roundup_type: string;
  period_start: string;
  period_end: string;
  story_ids: string[];
  slide_data: any;
  stats: any;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  slides: any[];
  article: {
    source_url: string;
    region: string;
    published_at?: string;
  };
}

export default function DailyRoundupList() {
  const { slug, date } = useParams<{ slug: string; date: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [roundup, setRoundup] = useState<Roundup | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Filter states
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug || !date) {
        navigate('/');
        return;
      }

      try {
        // Fetch topic
        const { data: topicData, error: topicError } = await supabase
          .from('topics')
          .select('id, name, slug, branding_config, keywords, landmarks, organizations')
          .eq('slug', slug)
          .eq('is_public', true)
          .eq('is_active', true)
          .single();

        if (topicError || !topicData) {
          console.error('Topic fetch error:', topicError);
          toast({
            title: "Error",
            description: "Could not find this topic.",
            variant: "destructive",
          });
          navigate('/');
          return;
        }

        setTopic(topicData);

        // Parse date and fetch roundup
        const dateFormatted = format(parseISO(date), 'yyyy-MM-dd');
        
        const { data: roundupData, error: roundupError } = await supabase
          .from('topic_roundups')
          .select('*')
          .eq('topic_id', topicData.id)
          .eq('roundup_type', 'daily')
          .gte('period_start', `${dateFormatted}T00:00:00Z`)
          .lt('period_start', `${dateFormatted}T23:59:59.999Z`)
          .eq('is_published', true)
          .maybeSingle();

        if (roundupError) {
          console.error('Roundup fetch error:', roundupError);
          toast({
            title: "Error",
            description: "Could not load roundup.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }

        if (!roundupData) {
          setLoading(false);
          return;
        }

        setRoundup(roundupData);

        // Fetch stories using story_ids
        if (roundupData.story_ids && roundupData.story_ids.length > 0) {
          const { data: storiesData, error: storiesError } = await supabase
            .from('stories')
            .select(`
              *,
              slides (
                id,
                slide_number,
                content,
                word_count,
                links,
                alt_text
              )
            `)
            .in('id', roundupData.story_ids)
            .eq('is_published', true);

          if (storiesError) {
            console.error('Stories fetch error:', storiesError);
          } else {
            // Fetch engagement metrics for all stories
            const { data: engagementData } = await supabase
              .from('story_interactions')
              .select('story_id, interaction_type')
              .in('story_id', roundupData.story_ids);

            // Calculate engagement scores
            const engagementMap = new Map<string, number>();
            (engagementData || []).forEach((interaction: any) => {
              const score = engagementMap.get(interaction.story_id) || 0;
              // Weight: shares = 3, swipes = 1, views = 0.5
              if (interaction.interaction_type === 'share_click') {
                engagementMap.set(interaction.story_id, score + 3);
              } else if (interaction.interaction_type === 'swipe') {
                engagementMap.set(interaction.story_id, score + 1);
              } else if (interaction.interaction_type === 'view') {
                engagementMap.set(interaction.story_id, score + 0.5);
              }
            });

            // Transform and sort by engagement
            const transformedStories = (storiesData || []).map((story: any) => ({
              ...story,
              updated_at: story.updated_at || story.created_at,
              article: {
                source_url: story.article?.shared_content?.source_url || '',
                region: story.article?.shared_content?.region || '',
                published_at: story.article?.shared_content?.published_at || story.created_at,
              },
              engagementScore: engagementMap.get(story.id) || 0
            }));

            // Sort by engagement score (highest first)
            transformedStories.sort((a, b) => b.engagementScore - a.engagementScore);
            
            setStories(transformedStories);
          }
        }

        setLoading(false);
      } catch (error) {
        console.error('Fetch error:', error);
        toast({
          title: "Error",
          description: "Something went wrong.",
          variant: "destructive",
        });
        setLoading(false);
      }
    };

    fetchData();
  }, [slug, date, navigate, toast]);

  // Extract available keywords, locations (landmarks + organizations) and sources from stories based on topic config
  const { availableKeywords, availableLocations, availableSources } = useMemo(() => {
    if (!topic) return { availableKeywords: [], availableLocations: [], availableSources: [] };
    
    const topicKeywords = topic.keywords || [];
    const topicLandmarks = topic.landmarks || [];
    const topicOrganizations = topic.organizations || [];
    
    const keywordCounts = new Map<string, number>();
    const locationCounts = new Map<string, number>();
    const sourceMap = new Map<string, { domain: string; count: number }>();

    stories.forEach(story => {
      const storyText = story.slides?.map(s => s.content).join(' ').toLowerCase() || '';
      
      // Count topic keywords that appear in this story
      topicKeywords.forEach(keyword => {
        if (storyText.includes(keyword.toLowerCase())) {
          keywordCounts.set(keyword, (keywordCounts.get(keyword) || 0) + 1);
        }
      });
      
      // Count topic landmarks and organizations (combined as "locations")
      [...topicLandmarks, ...topicOrganizations].forEach(location => {
        if (storyText.includes(location.toLowerCase())) {
          locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
        }
      });

      // Extract source domains
      if (story.article?.source_url) {
        try {
          const domain = new URL(story.article.source_url).hostname.replace('www.', '');
          const existing = sourceMap.get(domain);
          if (existing) {
            existing.count++;
          } else {
            sourceMap.set(domain, { domain, count: 1 });
          }
        } catch (e) {
          // Invalid URL
        }
      }
    });

    return {
      availableKeywords: Array.from(keywordCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([keyword, count]) => ({ keyword, count })),
      availableLocations: Array.from(locationCounts.entries())
        .sort((a, b) => b[1] - a[1])
        .map(([keyword, count]) => ({ keyword, count })),
      availableSources: Array.from(sourceMap.values())
        .sort((a, b) => b.count - a.count)
        .map(s => ({
          source_name: s.domain.split('.')[0],
          source_domain: s.domain,
          count: s.count
        })),
    };
  }, [stories, topic]);

  // Filter stories
  const filteredStories = useMemo(() => {
    if (selectedKeywords.length === 0 && selectedLocations.length === 0 && selectedSources.length === 0) {
      return stories;
    }

    return stories.filter(story => {
      const storyText = story.slides?.map(s => s.content).join(' ').toLowerCase() || '';
      
      // Keyword filter
      if (selectedKeywords.length > 0) {
        const hasKeyword = selectedKeywords.some(kw => storyText.includes(kw.toLowerCase()));
        if (!hasKeyword) return false;
      }
      
      // Location filter (landmarks + organizations)
      if (selectedLocations.length > 0) {
        const hasLocation = selectedLocations.some(loc => storyText.includes(loc.toLowerCase()));
        if (!hasLocation) return false;
      }

      // Source filter
      if (selectedSources.length > 0 && story.article?.source_url) {
        try {
          const domain = new URL(story.article.source_url).hostname.replace('www.', '');
          if (!selectedSources.includes(domain)) return false;
        } catch (e) {
          return false;
        }
      }

      return true;
    });
  }, [stories, selectedKeywords, selectedLocations, selectedSources]);

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords(prev =>
      prev.includes(keyword)
        ? prev.filter(k => k !== keyword)
        : [...prev, keyword]
    );
  };

  const toggleSource = (source: string) => {
    setSelectedSources(prev =>
      prev.includes(source)
        ? prev.filter(s => s !== source)
        : [...prev, source]
    );
  };
  
  const toggleLocation = (location: string) => {
    setSelectedLocations(prev =>
      prev.includes(location)
        ? prev.filter(l => l !== location)
        : [...prev, location]
    );
  };

  const clearAllFilters = () => {
    setSelectedKeywords([]);
    setSelectedLocations([]);
    setSelectedSources([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen feed-background">
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="w-32 h-10 mb-6" />
          <Skeleton className="w-64 h-8 mb-4" />
          <div className="space-y-8">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="w-full h-96 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!roundup || !topic) {
    return (
      <div className="min-h-screen feed-background">
        <div className="container mx-auto px-4 py-8">
          <Button
            variant="ghost"
            onClick={() => navigate(`/feed/${slug}`)}
            className="mb-6"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Button>
          <div className="text-center space-y-4">
            <h1 className="text-3xl font-bold">Briefing Not Available</h1>
            <p className="text-muted-foreground">
              This daily briefing doesn't exist or hasn't been published yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const formattedDate = format(parseISO(roundup.period_start), 'EEE MMM d');
  const hasActiveFilters = selectedKeywords.length > 0 || selectedLocations.length > 0 || selectedSources.length > 0;

  return (
    <div className="min-h-screen feed-background">
      <RoundupSEO
        roundup={roundup}
        topicName={topic.name}
        topicSlug={slug || ''}
      />

      {/* Header */}
      <div className="bg-background border-b border-border sticky top-0 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                asChild
              >
                <Link to={`/feed/${slug}`}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Feed
                </Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                asChild
              >
                <Link to={`/feed/${slug}/briefings`}>
                  <LayoutList className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">All Briefings</span>
                </Link>
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsModalOpen(true)}
              className={hasActiveFilters ? "border-primary text-primary" : ""}
            >
              <Filter className="w-4 h-4 mr-2" />
              Filters
              {hasActiveFilters && (
                <span className="ml-2 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs">
                  {filteredStories.length}
                </span>
              )}
            </Button>
          </div>
          
          <div className="text-center space-y-3">
            <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground font-medium">
              Daily Briefing
            </p>
            <h1 className="text-3xl md:text-4xl font-bold">{formattedDate}</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const shareUrl = `${window.location.origin}/feed/${slug}/daily/${date}`;
                const shareText = `${topic.name} Daily Briefing - ${formattedDate}`;
                if (navigator.share) {
                  navigator.share({
                    title: shareText,
                    text: `${shareText} - ${filteredStories.length} ${filteredStories.length === 1 ? 'story' : 'stories'}`,
                    url: shareUrl
                  }).catch(() => {});
                } else {
                  navigator.clipboard.writeText(shareUrl);
                  toast({
                    title: "Link copied",
                    description: "Briefing link copied to clipboard",
                  });
                }
              }}
            >
              <Share2 className="w-4 h-4 mr-2" />
              Share {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'}
            </Button>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      {hasActiveFilters && (
        <div className="container mx-auto px-4 py-4">
          <FeedFilters
            slideCount={filteredStories.length}
            selectedKeywords={selectedKeywords}
            onRemoveKeyword={(kw) => setSelectedKeywords(prev => prev.filter(k => k !== kw))}
            selectedLocations={selectedLocations}
            onRemoveLocation={(loc) => setSelectedLocations(prev => prev.filter(l => l !== loc))}
            selectedSources={selectedSources}
            onRemoveSource={(src) => setSelectedSources(prev => prev.filter(s => s !== src))}
            hasActiveFilters={hasActiveFilters}
            filteredStoryCount={filteredStories.length}
          />
        </div>
      )}

      {/* Story list */}
      <div className="container mx-auto px-4 py-8">
        {filteredStories.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {hasActiveFilters 
                ? "No stories match your filters. Try adjusting them."
                : "No stories in this roundup yet."}
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {filteredStories.map((story, index) => (
              <div key={story.id}>
                <StoryCarousel
                  story={story}
                  storyUrl={`${window.location.origin}/feed/${slug}/story/${story.id}`}
                  topicId={topic.id}
                  storyIndex={index}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Modal */}
      <FilterModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        availableKeywords={availableKeywords}
        selectedKeywords={selectedKeywords}
        onKeywordToggle={toggleKeyword}
        availableLandmarks={availableLocations}
        selectedLandmarks={selectedLocations}
        onLandmarkToggle={toggleLocation}
        availableOrganizations={[]}
        selectedOrganizations={[]}
        onOrganizationToggle={() => {}}
        availableSources={availableSources}
        selectedSources={selectedSources}
        onSourceToggle={toggleSource}
        onClearAll={clearAllFilters}
      />
    </div>
  );
}
