import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Hash, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StoryCarousel from "@/components/StoryCarousel";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  updated_at: string;
  slides: Array<{
    id: string;
    slide_number: number;
    content: string;
  }>;
  article: {
    source_url: string;
    region: string;
    published_at?: string;
  };
}

interface Topic {
  id: string;
  name: string;
  slug: string;
  topic_type: 'regional' | 'keyword';
}

const StoryPage = () => {
  const { slug, storyId } = useParams<{ slug: string; storyId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [story, setStory] = useState<Story | null>(null);
  const [topic, setTopic] = useState<Topic | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Check if this is a regional feed story URL
  const isRegionalFeed = window.location.pathname.includes('/eastbourne-feed/story/');

  useEffect(() => {
    const loadStoryAndTopic = async () => {
      if (isRegionalFeed) {
        // Handle regional feed story
        if (!storyId) {
          navigate('/eastbourne-feed');
          return;
        }
        await loadRegionalStory();
      } else {
        // Handle topic feed story
        if (!slug || !storyId) {
          navigate('/');
          return;
        }
        await loadTopicStory();
      }
    };

    const loadRegionalStory = async () => {
      try {
        // Load story for regional feed
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select(`
            id,
            title,
            author,
            publication_name,
            created_at,
            updated_at,
            slides (
              id,
              slide_number,
              content
            ),
            articles!inner (
              source_url,
              region,
              published_at
            )
          `)
          .eq('id', storyId)
          .eq('status', 'published')
          .ilike('articles.region', '%eastbourne%')
          .single();

        if (storyError) {
          throw new Error('Story not found in Eastbourne region');
        }

        const transformedStory = {
          id: storyData.id,
          title: storyData.title,
          author: storyData.author,
          publication_name: storyData.publication_name,
          created_at: storyData.created_at,
          updated_at: storyData.updated_at,
          slides: storyData.slides.sort((a, b) => a.slide_number - b.slide_number),
          article: {
            source_url: storyData.articles.source_url,
            region: storyData.articles.region,
            published_at: storyData.articles.published_at
          }
        };

        setStory(transformedStory);
        // Set a mock topic for regional feeds
        setTopic({
          id: 'eastbourne',
          name: 'Eastbourne',
          slug: 'eastbourne',
          topic_type: 'regional'
        });
      } catch (error) {
        console.error('Error loading regional story:', error);
        toast({
          title: "Error",
          description: "Story not found",
          variant: "destructive",
        });
        navigate('/eastbourne-feed');
      } finally {
        setLoading(false);
      }
    };

    const loadTopicStory = async () => {
      try {
        const { data: topicData, error: topicError } = await supabase
          .from('topics')
          .select('id, name, slug, topic_type')
          .eq('slug', slug)
          .eq('is_active', true)
          .single();

        if (topicError) {
          throw new Error('Topic not found');
        }

        setTopic({
          ...topicData,
          topic_type: topicData.topic_type as 'regional' | 'keyword'
        });

        // Load story
        const { data: storyData, error: storyError } = await supabase
          .from('stories')
          .select(`
            id,
            title,
            author,
            publication_name,
            created_at,
            updated_at,
            slides (
              id,
              slide_number,
              content
            ),
            articles!inner (
              source_url,
              region,
              published_at
            )
          `)
          .eq('id', storyId)
          .eq('status', 'published')
          .eq('articles.topic_id', topicData.id)
          .single();

        if (storyError) {
          throw new Error('Story not found');
        }

        const transformedStory = {
          id: storyData.id,
          title: storyData.title,
          author: storyData.author,
          publication_name: storyData.publication_name,
          created_at: storyData.created_at,
          updated_at: storyData.updated_at,
          slides: storyData.slides
            .sort((a, b) => a.slide_number - b.slide_number)
            .map(slide => ({
              id: slide.id,
              slide_number: slide.slide_number,
              content: slide.content,
            })),
          article: {
            source_url: storyData.articles.source_url,
            region: storyData.articles.region,
            published_at: storyData.articles.published_at
          }
        };

        setStory(transformedStory);
      } catch (error) {
        console.error('Error loading story:', error);
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to load story",
          variant: "destructive"
        });
        navigate(`/feed/topic/${slug}`);
      } finally {
        setLoading(false);
      }
    };

    loadStoryAndTopic();
  }, [slug, storyId, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6">
            <Skeleton className="w-32 h-10" />
          </div>
          <div className="mb-8">
            <Skeleton className="w-full h-12" />
          </div>
          <Skeleton className="w-full h-96 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!story || !topic) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Story Not Found</h1>
            <p className="text-muted-foreground">
              The story you're looking for doesn't exist or is no longer available.
            </p>
            <Button asChild>
              <Link to={`/feed/topic/${slug}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to {topic?.name || 'Feed'}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
      <div className="container mx-auto px-4 py-8">
        {/* Back Button and Topic Header */}
        <div className="mb-6">
            <Button variant="outline" asChild className="mb-4">
              <Link to={isRegionalFeed ? '/eastbourne-feed' : `/feed/topic/${slug}`}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to {topic.name}
              </Link>
            </Button>
          
          <div className="flex items-center gap-2 mb-2">
            {topic.topic_type === 'regional' ? (
              <MapPin className="w-5 h-5 text-blue-500" />
            ) : (
              <Hash className="w-5 h-5 text-green-500" />
            )}
            <h1 className="text-2xl font-bold text-muted-foreground">
              {topic.name}
            </h1>
          </div>
        </div>

        {/* Story */}
        <div className="max-w-4xl mx-auto">
          <StoryCarousel 
            story={story} 
            storyUrl={isRegionalFeed 
              ? `${window.location.origin}/eastbourne-feed/story/${story.id}`
              : `${window.location.origin}/feed/topic/${slug}/story/${story.id}`
            }
          />
        </div>
      </div>
    </div>
  );
};

export default StoryPage;