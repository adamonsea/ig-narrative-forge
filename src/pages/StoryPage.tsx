import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Hash, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StoryCarousel from "@/components/StoryCarousel";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StoryPageSEO } from "@/components/seo/StoryPageSEO";

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
  branding_config?: {
    logo_url?: string;
    icon_url?: string;
    subheader?: string;
  };
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
        // Load topic (branding_config is accessible for public topics)
        const { data: topicData, error: topicError } = await supabase
          .from('topics')
          .select('id, name, slug, topic_type, branding_config')
          .eq('slug', slug.toLowerCase())
          .eq('is_public', true)
          .eq('is_active', true)
          .maybeSingle();

        if (topicError || !topicData) {
          console.error('Topic error:', topicError);
          setTopic(null);
          setLoading(false);
          return;
        }

        setTopic({
          ...topicData,
          topic_type: topicData.topic_type as 'regional' | 'keyword',
          branding_config: topicData.branding_config as Topic['branding_config']
        });

        // Use the secure RPC function to fetch story data
        const { data: storyData, error: storyError } = await supabase
          .rpc('get_public_story_by_slug_and_id', {
            p_slug: slug,
            p_story_id: storyId
          });

        if (storyError || !storyData) {
          console.error('Story error:', storyError);
          setStory(null);
          setLoading(false);
          return;
        }

        // Parse the JSONB result
        const data = storyData as any;
        const parsedStory: Story = {
          id: data.id,
          title: data.title,
          author: data.author,
          publication_name: data.publication_name,
          cover_illustration_url: data.cover_illustration_url,
          created_at: data.created_at,
          updated_at: data.updated_at,
          slides: data.slides || [],
          article: data.article || {
            source_url: '',
            region: '',
            published_at: null
          }
        };

        setStory(parsedStory);
      } catch (error) {
        console.error('Error loading story:', error);
        setStory(null);
      } finally {
        setLoading(false);
      }
    };

    loadStoryAndTopic();
  }, [slug, storyId, navigate]);

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
      {/* SEO Meta Tags */}
      <StoryPageSEO
        story={story}
        topicName={topic.name}
        topicSlug={slug}
        topicType={topic.topic_type}
        topicLogoUrl={topic.branding_config?.logo_url}
      />

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