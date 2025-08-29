import { useParams } from "react-router-dom";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import StoryCarousel from "@/components/StoryCarousel";
import { FeedFilters } from "@/components/FeedFilters";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { MapPin, Hash, Globe, Lock } from "lucide-react";

type SortOption = "newest" | "oldest";

interface Story {
  id: string;
  title: string;
  author: string;
  publication_name: string;
  created_at: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
    word_count: number;
    visual?: {
      image_url: string;
      alt_text: string;
    };
  }>;
  article: {
    source_url: string;
    published_at: string;
    region: string;
  };
}

interface Topic {
  id: string;
  name: string;
  description: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  is_public: boolean;
  created_by: string;
}

const TopicFeed = () => {
  const { slug } = useParams<{ slug: string }>();
  const [stories, setStories] = useState<Story[]>([]);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const { toast } = useToast();

  useEffect(() => {
    if (slug) {
      loadTopicAndStories();
    }
  }, [slug, sortBy]);

  const loadTopicAndStories = async () => {
    try {
      // First load the topic
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (topicError) {
        if (topicError.code === 'PGRST116') {
          throw new Error('Topic not found');
        }
        throw topicError;
      }

      setTopic({
        ...topicData,
        topic_type: topicData.topic_type as 'regional' | 'keyword'
      });

      // Then load stories for this topic
      let query = supabase
        .from('stories')
        .select(`
          id,
          title,
          author,
          publication_name,
          created_at,
          slides (
            id,
            slide_number,
            content,
            word_count,
            visuals (
              image_url,
              alt_text
            )
          ),
          articles!inner (
            source_url,
            published_at,
            region
          )
        `)
        .eq('status', 'ready')
        .eq('is_published', true) // Only show published stories in live feed
        .eq('articles.topic_id', topicData.id)
        .order('created_at', { ascending: sortBy === 'oldest' });

      const { data: storiesData, error: storiesError } = await query;

      if (storiesError) throw storiesError;

      // Transform the data to match the expected structure
      const transformedStories = (storiesData || []).map(story => ({
        id: story.id,
        title: story.title,
        author: story.author || 'Unknown',
        publication_name: story.publication_name || 'Unknown Publication',
        created_at: story.created_at,
        slides: story.slides
          .sort((a, b) => a.slide_number - b.slide_number)
          .map(slide => ({
            id: slide.id,
            slide_number: slide.slide_number,
            content: slide.content,
            word_count: slide.word_count,
            visual: slide.visuals && slide.visuals[0] ? {
              image_url: slide.visuals[0].image_url,
              alt_text: slide.visuals[0].alt_text || ''
            } : undefined
          })),
        article: {
          source_url: story.articles.source_url,
          published_at: story.articles.published_at,
          region: story.articles.region || topic.region || 'Unknown'
        }
      }));

      setStories(transformedStories);
    } catch (error) {
      console.error('Error loading topic feed:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to load topic feed",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
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
        {/* Topic Header */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            {topic.topic_type === 'regional' ? (
              <MapPin className="w-6 h-6 text-blue-500" />
            ) : (
              <Hash className="w-6 h-6 text-green-500" />
            )}
            <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
              {topic.name}
            </h1>
            {topic.is_public ? (
              <Globe className="w-5 h-5 text-muted-foreground" />
            ) : (
              <Lock className="w-5 h-5 text-muted-foreground" />
            )}
          </div>
          
          {topic.description && (
            <p className="text-lg text-muted-foreground mb-4 max-w-2xl mx-auto">
              {topic.description}
            </p>
          )}

          {/* Keywords */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            {topic.keywords.map((keyword, index) => (
              <Badge key={index} variant="secondary">
                {keyword}
              </Badge>
            ))}
          </div>

          {/* Regional Info */}
          {topic.topic_type === 'regional' && topic.region && (
            <div className="text-sm text-muted-foreground">
              Regional coverage: {topic.region}
            </div>
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

        {/* Stories */}
        {stories.length > 0 ? (
          <div className="space-y-8">
            {stories.map((story) => (
              <StoryCarousel 
                key={story.id} 
                story={story} 
                topicName={topic.name}
              />
            ))}
          </div>
        ) : (
          <div className="text-center py-12">
            <div className="space-y-2">
              <h3 className="text-xl font-semibold">No stories yet</h3>
              <p className="text-muted-foreground">
                Content for this topic is being curated. Check back soon!
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicFeed;