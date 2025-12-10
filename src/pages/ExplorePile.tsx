import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useTopicFavicon } from '@/hooks/useTopicFavicon';
import { PhotoPileCanvas } from '@/components/explore/PhotoPileCanvas';
import { ExploreStoryModal } from '@/components/explore/ExploreStoryModal';
import { toast } from 'sonner';

interface Story {
  id: string;
  title: string;
  cover_illustration_url: string;
  created_at: string;
  slides?: Array<{
    slide_number: number;
    content: string;
  }>;
  article?: {
    source_url: string;
  };
}

export default function ExplorePile() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicName, setTopicName] = useState('');
  const [topicBranding, setTopicBranding] = useState<any>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const faviconUrl = topicBranding?.icon_url || topicBranding?.logo_url;
  useTopicFavicon(faviconUrl);

  useEffect(() => {
    const fetchData = async () => {
      if (!slug) return;

      // Fetch topic
      const { data: topic, error: topicError } = await supabase
        .from('topics')
        .select('id, name, branding_config')
        .eq('slug', slug)
        .eq('is_public', true)
        .eq('is_active', true)
        .single();

      if (topicError || !topic) {
        toast.error('Topic not found');
        navigate('/');
        return;
      }

      setTopicName(topic.name);
      setTopicBranding(topic.branding_config);

      // Fetch stories with cover images from last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // Use the RPC for reliable topic filtering
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('get_topic_stories_with_keywords', {
          p_topic_id: topic.id,
          p_limit: 150,
          p_offset: 0,
          p_keyword_filters: null,
          p_source_filters: null
        });

      if (rpcError) {
        console.error('Error fetching stories:', rpcError);
        setLoading(false);
        return;
      }

      if (rpcData) {
        const uniqueStories = new Map<string, Story>();
        const thirtyDaysAgoTime = thirtyDaysAgo.getTime();
        
        (rpcData as any[]).forEach(row => {
          const storyDate = new Date(row.created_at).getTime();
          if (row.cover_illustration_url && 
              !uniqueStories.has(row.story_id) &&
              storyDate >= thirtyDaysAgoTime) {
            uniqueStories.set(row.story_id, {
              id: row.story_id,
              title: row.headline || row.title,
              cover_illustration_url: row.cover_illustration_url,
              created_at: row.created_at,
              slides: [],
              article: { source_url: row.source_url }
            });
          }
        });
        setStories(Array.from(uniqueStories.values()));
      }

      setLoading(false);
    };

    fetchData();
  }, [slug, navigate]);

  const handleCardClick = async (story: Story) => {
    // Fetch full story data for modal
    const { data } = await supabase
      .rpc('get_public_story_by_slug_and_id', {
        p_slug: slug,
        p_story_id: story.id
      });

    if (data) {
      setSelectedStory({
        ...story,
        slides: (data as any).slides || [],
        article: (data as any).article
      });
    } else {
      setSelectedStory(story);
    }
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-hidden">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate(`/feed/${slug}`)}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Feed
          </Button>
          
          <span className="text-sm text-muted-foreground">
            {stories.length} stories
          </span>
        </div>
      </header>

      {/* Photo Pile Canvas */}
      <main className="flex-1 relative">
        {stories.length > 0 ? (
          <PhotoPileCanvas 
            stories={stories} 
            onCardClick={handleCardClick} 
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No stories with images found</p>
          </div>
        )}
      </main>

      {/* Story Modal */}
      <ExploreStoryModal
        story={selectedStory}
        open={modalOpen}
        onOpenChange={setModalOpen}
        topicSlug={slug || ''}
      />
    </div>
  );
}
