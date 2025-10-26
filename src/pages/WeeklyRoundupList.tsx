import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { format, parseISO, startOfWeek } from "date-fns";
import StoryCarousel from "@/components/StoryCarousel";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Filter } from "lucide-react";
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

export default function WeeklyRoundupList() {
  const { slug, weekStart } = useParams<{ slug: string; weekStart: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [roundup, setRoundup] = useState<Roundup | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  // Filter states
  const [selectedKeywords, setSelectedKeywords] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug || !weekStart) {
        navigate('/');
        return;
      }

      try {
        // Fetch topic
        const { data: topicData, error: topicError } = await supabase
          .from('topics')
          .select('id, name, slug, branding_config')
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

        // Parse week start date
        const weekStartDate = parseISO(weekStart);
        const weekStartFormatted = format(startOfWeek(weekStartDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        const { data: roundupData, error: roundupError } = await supabase
          .from('topic_roundups')
          .select('*')
          .eq('topic_id', topicData.id)
          .eq('roundup_type', 'weekly')
          .gte('period_start', `${weekStartFormatted}T00:00:00Z`)
          .lt('period_start', `${weekStartFormatted}T23:59:59.999Z`)
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
              id,
              title,
              author,
              publication_name,
              created_at,
              is_published,
              cover_illustration_url,
              slides (
                id,
                slide_number,
                content,
                word_count,
                links,
                alt_text
              ),
              article:topic_articles!inner (
                shared_content:shared_content!inner (
                  source_url,
                  published_at,
                  region
                )
              )
            `)
            .in('id', roundupData.story_ids)
            .eq('is_published', true)
            .order('created_at', { ascending: false });

          if (storiesError) {
            console.error('Stories fetch error:', storiesError);
          } else {
            // Transform the nested data structure
            const transformedStories = (storiesData || []).map((story: any) => ({
              ...story,
              updated_at: story.updated_at || story.created_at,
              article: {
                source_url: story.article?.shared_content?.source_url || '',
                region: story.article?.shared_content?.region || '',
                published_at: story.article?.shared_content?.published_at || story.created_at,
              }
            }));
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
  }, [slug, weekStart, navigate, toast]);

  // Extract available keywords and sources from stories
  const { availableKeywords, availableSources } = useMemo(() => {
    const keywordSet = new Set<string>();
    const sourceMap = new Map<string, { domain: string; count: number }>();

    stories.forEach(story => {
      // Extract keywords from story content (simplified)
      story.slides?.forEach(slide => {
        const words = slide.content?.toLowerCase().split(/\s+/) || [];
        words.forEach(word => {
          if (word.length > 4) keywordSet.add(word);
        });
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
      availableKeywords: Array.from(keywordSet).slice(0, 50).sort().map(kw => ({
        keyword: kw,
        count: 1
      })),
      availableSources: Array.from(sourceMap.values())
        .sort((a, b) => b.count - a.count)
        .map(s => ({
          source_name: s.domain.split('.')[0],
          source_domain: s.domain,
          count: s.count
        })),
    };
  }, [stories]);

  // Filter stories
  const filteredStories = useMemo(() => {
    if (selectedKeywords.length === 0 && selectedSources.length === 0) {
      return stories;
    }

    return stories.filter(story => {
      // Keyword filter
      if (selectedKeywords.length > 0) {
        const storyText = story.slides?.map(s => s.content).join(' ').toLowerCase() || '';
        const hasKeyword = selectedKeywords.some(kw => storyText.includes(kw.toLowerCase()));
        if (!hasKeyword) return false;
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
  }, [stories, selectedKeywords, selectedSources]);

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

  const clearAllFilters = () => {
    setSelectedKeywords([]);
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
            <h1 className="text-3xl font-bold">Roundup Not Available</h1>
            <p className="text-muted-foreground">
              This weekly roundup doesn't exist or hasn't been published yet.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const startDate = format(parseISO(roundup.period_start), 'MMMM d');
  const endDate = format(parseISO(roundup.period_end), 'MMMM d, yyyy');
  const hasActiveFilters = selectedKeywords.length > 0 || selectedSources.length > 0;

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
          
          <div className="text-center">
            <h1 className="text-2xl md:text-3xl font-bold mb-1">{startDate} - {endDate}</h1>
            <p className="text-lg text-muted-foreground mb-1">{topic.name} Weekly Roundup</p>
            <p className="text-sm text-muted-foreground">
              {filteredStories.length} {filteredStories.length === 1 ? 'story' : 'stories'}
            </p>
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
        availableSources={availableSources}
        selectedSources={selectedSources}
        onSourceToggle={toggleSource}
        onClearAll={clearAllFilters}
        availableLandmarks={[]}
        selectedLandmarks={[]}
        onLandmarkToggle={() => {}}
        availableOrganizations={[]}
        selectedOrganizations={[]}
        onOrganizationToggle={() => {}}
      />
    </div>
  );
}
