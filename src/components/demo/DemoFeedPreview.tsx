import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';

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
  topicId: string;
  topicSlug: string;
}

export const DemoFeedPreview = ({ topicName, topicId, topicSlug }: DemoFeedPreviewProps) => {
  const [stories, setStories] = useState<DemoStory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStories = async () => {
      // First get topic_article IDs for this topic
      const { data: topicArticles } = await supabase
        .from('topic_articles')
        .select('id')
        .eq('topic_id', topicId);

      if (!topicArticles || topicArticles.length === 0) {
        setLoading(false);
        return;
      }

      const taIds = topicArticles.map(ta => ta.id);

      // Fetch published stories linked to these topic articles
      const { data, error } = await supabase
        .from('stories')
        .select('id, title, cover_illustration_url, created_at, publication_name, slides(id)')
        .eq('status', 'published')
        .in('topic_article_id', taIds)
        .order('created_at', { ascending: false })
        .limit(8);

      if (!error && data) {
        const validStories = (data as any[])
          .filter((s) => s.slides && s.slides.length > 0 && s.cover_illustration_url)
          .map((s) => ({
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
  }, [topicId]);

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h3 className="text-2xl md:text-3xl font-display font-semibold text-white">
          Your feed is live
        </h3>
      </div>

      {/* Story cards */}
      <div className="max-w-2xl mx-auto">
        {loading ? (
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : stories.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-white/40 text-sm">Generating stories…</p>
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
                  to={`/feed/${topicSlug}`}
                  className="flex items-center gap-4 rounded-xl p-3 bg-[hsl(214,50%,12%)] border border-white/10 hover:border-white/20 transition-all group"
                >
                  {story.cover_illustration_url && (
                    <img
                      src={story.cover_illustration_url}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover shrink-0"
                      loading="lazy"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white line-clamp-2 group-hover:text-[hsl(155,100%,67%)] transition-colors">
                      {story.title}
                    </h4>
                    {story.publication_name && (
                      <span className="text-xs text-white/30 mt-1 block">{story.publication_name}</span>
                    )}
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* View feed link */}
      <div className="text-center">
        <Button
          asChild
          variant="ghost"
          className="text-[hsl(270,100%,68%)] hover:text-[hsl(270,100%,75%)] hover:bg-[hsl(270,100%,68%)]/10"
        >
          <Link to={`/feed/${topicSlug}`}>
            View full feed <ArrowRight className="w-4 h-4 ml-1" />
          </Link>
        </Button>
      </div>

      {/* CTA */}
      <div className="text-center pt-2">
        <Button
          asChild
          size="lg"
          className="rounded-full bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)]"
        >
          <Link to="/auth">Start curating free</Link>
        </Button>
      </div>
    </div>
  );
};
