import { useParams, useNavigate, Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { ArrowLeft, Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import StoryCarousel from "@/components/StoryCarousel";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { StoryPageSEO } from "@/components/seo/StoryPageSEO";
import { StoryStructuredData } from "@/components/seo/StoryStructuredData";
import { StoryRatingCard } from "@/components/swipe-mode/StoryRatingCard";
import { useTopicFavicon } from "@/hooks/useTopicFavicon";

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
  canonicalStoryId?: string; // The original story ID for duplicate content
  canonicalTopicSlug?: string; // The topic slug of the original story
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
        
        // Look up the canonical (original) story for duplicate content
        // This handles: 1) Same content in multiple topics, 2) Same title scraped twice in same topic
        let canonicalStoryId: string | undefined;
        let canonicalTopicSlug: string | undefined;
        
        if (data.shared_content_id) {
          // Find the oldest story with the same shared_content_id (cross-topic duplicates)
          const { data: canonicalData } = await supabase
            .from('stories')
            .select(`
              id,
              topic_article:topic_articles!inner(
                shared_content_id,
                topic:topics!inner(slug)
              )
            `)
            .eq('topic_article.shared_content_id', data.shared_content_id)
            .eq('status', 'published')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          if (canonicalData && canonicalData.id !== storyId) {
            canonicalStoryId = canonicalData.id;
            canonicalTopicSlug = (canonicalData.topic_article as any)?.topic?.slug;
          }
        }
        
        // If no canonical found via shared_content_id, check for title duplicates in same topic
        if (!canonicalStoryId && data.title) {
          const { data: titleDuplicates } = await supabase
            .from('stories')
            .select('id')
            .eq('title', data.title)
            .eq('status', 'published')
            .order('created_at', { ascending: true })
            .limit(1)
            .maybeSingle();
          
          if (titleDuplicates && titleDuplicates.id !== storyId) {
            canonicalStoryId = titleDuplicates.id;
            canonicalTopicSlug = slug; // Same topic
          }
        }
        
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
          },
          canonicalStoryId,
          canonicalTopicSlug
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

  // Update favicon based on topic branding
  const faviconUrl = topic?.branding_config?.icon_url || topic?.branding_config?.logo_url;
  useTopicFavicon(faviconUrl);

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
      <div className="min-h-screen bg-gradient-to-br from-background to-muted/50 flex items-center justify-center">
        <div className="container mx-auto px-4 py-8 max-w-md animate-fade-in">
          <div className="text-center space-y-6">
            {/* Archive icon */}
            <div className="mx-auto w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center">
              <Archive className="w-8 h-8 text-muted-foreground" />
            </div>
            
            {/* Headline */}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold text-foreground">
                This story has been archived
              </h1>
              <p className="text-muted-foreground text-sm">
                Stories are regularly curated to keep your feed fresh
              </p>
            </div>
            
            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
              <Button asChild>
                <Link to={`/feed/${slug || ''}`}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Feed
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link to={`/feed/${slug || ''}/archive`}>
                  View Archive
                </Link>
              </Button>
            </div>
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
        canonicalStoryId={story.canonicalStoryId}
        canonicalTopicSlug={story.canonicalTopicSlug}
      />
      
      {/* Article Structured Data for SEO */}
      <StoryStructuredData
        story={story}
        storyUrl={`${window.location.origin}/feed/${slug}/story/${story.id}`}
        topicName={topic.name}
        topicSlug={slug || ''}
        position={0}
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
        
        {/* Story Rating Stats - links to Play Mode */}
        <div className="p-4">
          <StoryRatingCard storyId={story.id} topicSlug={slug} />
        </div>
      </div>
    </div>
  );
};

export default StoryPage;