import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useTopicFavicon } from '@/hooks/useTopicFavicon';
import { PhotoPileCanvas } from '@/components/explore/PhotoPileCanvas';
import { ExploreStoryModal } from '@/components/explore/ExploreStoryModal';
import { toast } from 'sonner';
import { format, parseISO, startOfWeek as getStartOfWeek } from 'date-fns';

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
  const [searchParams] = useSearchParams();
  const weekParam = searchParams.get('week');
  const navigate = useNavigate();
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(true);
  const [topicName, setTopicName] = useState('');
  const [topicBranding, setTopicBranding] = useState<any>(null);
  const [selectedStory, setSelectedStory] = useState<Story | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [weekLabel, setWeekLabel] = useState<string | null>(null);

  // Update favicon based on topic branding (pass full branding config for optimized variants)
  useTopicFavicon(topicBranding as any);

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

      // If week param is provided, fetch stories from that weekly roundup
      if (weekParam) {
        const weekStartDate = parseISO(weekParam);
        const weekStartFormatted = format(getStartOfWeek(weekStartDate, { weekStartsOn: 1 }), 'yyyy-MM-dd');

        // Fetch the roundup for this week
        const { data: roundupData, error: roundupError } = await supabase
          .from('topic_roundups')
          .select('story_ids, period_start, period_end')
          .eq('topic_id', topic.id)
          .eq('roundup_type', 'weekly')
          .gte('period_start', `${weekStartFormatted}T00:00:00Z`)
          .lt('period_start', `${weekStartFormatted}T23:59:59.999Z`)
          .eq('is_published', true)
          .maybeSingle();

        if (roundupError || !roundupData || !roundupData.story_ids?.length) {
          toast.error('Weekly roundup not found');
          setLoading(false);
          return;
        }

        // Set week label
        const startDate = parseISO(roundupData.period_start);
        const endDate = parseISO(roundupData.period_end);
        setWeekLabel(`${format(startDate, 'MMM d')} - ${format(endDate, 'd')}`);

        // Fetch stories from the roundup
        const { data: storiesData, error: storiesError } = await supabase
          .from('stories')
          .select('id, title, cover_illustration_url, created_at')
          .in('id', roundupData.story_ids)
          .eq('is_published', true)
          .not('cover_illustration_url', 'is', null);

        if (storiesError) {
          console.error('[Explore] Error fetching roundup stories:', storiesError);
          setLoading(false);
          return;
        }

        const mappedStories = (storiesData || []).map(s => ({
          ...s,
          slides: [],
          article: { source_url: '' }
        }));

        setStories(mappedStories);
        setLoading(false);
        return;
      }

      // Default: Fetch stories from last 30 days
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

      console.log('[Explore] RPC response:', { 
        rpcError, 
        rowCount: rpcData?.length,
        sampleRow: rpcData?.[0]
      });

      if (rpcError) {
        console.error('[Explore] Error fetching stories:', rpcError);
        setLoading(false);
        return;
      }

      if (rpcData) {
        const uniqueStories = new Map<string, Story>();
        const thirtyDaysAgoTime = thirtyDaysAgo.getTime();
        
        (rpcData as any[]).forEach(row => {
          const storyDate = new Date(row.story_created_at).getTime();
          const hasImage = !!row.story_cover_illustration_url;
          const isNew = !uniqueStories.has(row.story_id);
          const isRecent = storyDate >= thirtyDaysAgoTime;
          
          if (hasImage && isNew && isRecent) {
            uniqueStories.set(row.story_id, {
              id: row.story_id,
              title: row.story_title,
              cover_illustration_url: row.story_cover_illustration_url,
              created_at: row.story_created_at,
              slides: [],
              article: { source_url: row.article_source_url }
            });
          }
        });
        
        console.log('[Explore] Filtered stories with images:', uniqueStories.size);
        setStories(Array.from(uniqueStories.values()));
      }

      setLoading(false);
    };

    fetchData();
  }, [slug, weekParam, navigate]);

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
            onClick={() => weekParam 
              ? navigate(`/feed/${slug}/weekly/${weekParam}`)
              : navigate(`/feed/${slug}`)
            }
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            {weekParam ? 'Back to Briefing' : 'Back to Feed'}
          </Button>
          
          <div className="flex items-center gap-3">
            {weekLabel && (
              <span className="text-sm font-medium text-foreground">
                {weekLabel}
              </span>
            )}
            <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 rounded-full">
              Beta
            </span>
            <span className="text-sm text-muted-foreground">
              {stories.length} stories
            </span>
          </div>
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
