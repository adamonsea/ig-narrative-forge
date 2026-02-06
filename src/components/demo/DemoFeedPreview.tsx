import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { DEMO_TOPIC_ID, DEMO_TOPIC_SLUG } from '@/lib/demoConfig';
import { PlayModeMenu } from '@/components/feed/PlayModeMenu';
import { SubscribeMenu } from '@/components/feed/SubscribeMenu';
import { Sparkles, ArrowRight, Users, Newspaper } from 'lucide-react';

interface DemoStory {
  id: string;
  title: string;
  cover_illustration_url?: string;
  created_at: string;
  publication_name?: string;
  slideCount: number;
}

interface DemoFeedPreviewProps {
  topicName: string;
}

export const DemoFeedPreview = ({ topicName }: DemoFeedPreviewProps) => {
  const [stories, setStories] = useState<DemoStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStories = async () => {
      // Fetch published stories with their slide counts
      const { data, error } = await supabase
        .from('stories')
        .select(`
          id, title, cover_illustration_url, created_at, publication_name,
          slides(id)
        `)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(8);

      if (!error && data) {
        // Filter to stories that actually have slides and cover images
        const validStories = data
          .filter((s: any) => s.slides && s.slides.length > 0 && s.cover_illustration_url)
          .map((s: any) => ({
            id: s.id,
            title: s.title,
            cover_illustration_url: s.cover_illustration_url,
            created_at: s.created_at,
            publication_name: s.publication_name,
            slideCount: s.slides.length,
          }));
        setStories(validStories);
      }
      setLoading(false);
    };
    fetchStories();
  }, []);

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, type: 'spring' }}
        >
          <Sparkles className="w-8 h-8 text-[hsl(155,100%,67%)] mx-auto mb-2" />
        </motion.div>
        <h3 className="text-2xl md:text-3xl font-display font-semibold text-white">
          Your feed is live
        </h3>
        <p className="text-white/50 text-sm">Here's what your curated feed looks like</p>
      </div>

      {/* Social proof badges */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        <Badge className="bg-white/5 text-white/60 border-white/10 text-xs gap-1.5">
          <Users className="w-3 h-3" /> 142 subscribers
        </Badge>
        <Badge className="bg-white/5 text-white/60 border-white/10 text-xs gap-1.5">
          <Newspaper className="w-3 h-3" /> 8 stories today
        </Badge>
      </div>

      {/* Feed actions */}
      <div className="flex items-center justify-center gap-2">
        <PlayModeMenu slug={DEMO_TOPIC_SLUG} showLabel showPulse={false} />
        <SubscribeMenu topicName="Demo Feed" topicId={DEMO_TOPIC_ID} showLabel />
      </div>

      {/* Story cards grid */}
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {stories.slice(0, 6).map((story, i) => (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.08, duration: 0.3 }}
              >
                <Link
                  to={`/feed/${DEMO_TOPIC_SLUG}`}
                  className="flex items-center gap-4 rounded-xl p-3 bg-[hsl(214,50%,12%)] border border-white/10 hover:border-white/20 transition-all group"
                >
                  {story.cover_illustration_url && (
                    <img
                      src={story.cover_illustration_url}
                      alt=""
                      className="w-16 h-16 rounded-lg object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white line-clamp-2 group-hover:text-[hsl(155,100%,67%)] transition-colors">
                      {story.title}
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                      {story.publication_name && (
                        <span className="text-xs text-white/30">{story.publication_name}</span>
                      )}
                      <span className="text-xs text-white/20">{story.slideCount} slides</span>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* View full feed CTA */}
      <div className="text-center">
        <Button
          asChild
          variant="ghost"
          className="text-[hsl(270,100%,68%)] hover:text-[hsl(270,100%,75%)] hover:bg-[hsl(270,100%,68%)]/10"
        >
          <Link to={`/feed/${DEMO_TOPIC_SLUG}`}>
            View the full live feed <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>

      {/* Floating CTA */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
        className="bg-gradient-to-r from-[hsl(270,100%,68%)]/20 to-[hsl(155,100%,67%)]/20 rounded-2xl p-6 border border-[hsl(270,100%,68%)]/30 text-center space-y-3"
      >
        <p className="text-white font-semibold">Like what you see?</p>
        <p className="text-white/50 text-sm">Start curating your own feed — free, no credit card required</p>
        <Button
          asChild
          size="lg"
          className="rounded-full bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]"
        >
          <Link to="/auth">Start curating free</Link>
        </Button>
      </motion.div>
    </div>
  );
};
