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
  cover_illustration_url: string | null;
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

  useEffect(() => {
    const loadStoryAndTopic = async () => {
      if (!slug || !storyId) {
        navigate('/');
        return;
      }
      
      try {
        // Load topic first
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
            cover_illustration_url,
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
              published_at,
              topic_id
            )
          `)
          .eq('id', storyId)
          .eq('is_published', true)
          .eq('status', 'ready')
          .single();

        if (storyError) {
          throw new Error('Story not found');
        }

        // Verify story belongs to this topic
        if (storyData.articles.topic_id !== topicData.id) {
          throw new Error('Story does not belong to this topic');
        }

        const transformedStory = {
          id: storyData.id,
          title: storyData.title,
          author: storyData.author,
          publication_name: storyData.publication_name,
          cover_illustration_url: storyData.cover_illustration_url,
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
        navigate(`/feed/${slug}`);
      } finally {
        setLoading(false);
      }
    };

    loadStoryAndTopic();
  }, [slug, storyId, navigate, toast]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50">
        <div className="container mx-auto px-1 md:px-4 py-8">
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
        <div className="container mx-auto px-1 md:px-4 py-8">
          <div className="text-center space-y-4">
            <h1 className="text-4xl font-bold">Story Not Found</h1>
            <p className="text-muted-foreground">
              The story you're looking for doesn't exist or is no longer available.
            </p>
            <Button asChild>
              <Link to={`/feed/${slug || ''}`}>
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
    <div className="min-h-screen feed-background">
      <div className="max-w-lg mx-auto">
        {/* Back Button */}
        <div className="p-4">
          <Button variant="outline" asChild>
            <Link to={`/feed/${slug}`}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to {topic.name}
            </Link>
          </Button>
        </div>
        
        <StoryCarousel 
          story={story} 
          storyUrl={`${window.location.origin}/feed/${slug}/story/${story.id}`}
          topicId={topic?.id}
          storyIndex={0}
        />
      </div>
    </div>
  );
};

export default StoryPage;