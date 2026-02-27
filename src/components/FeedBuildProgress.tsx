import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Check, Newspaper } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BuildPhase {
  key: string;
  label: string;
  status: 'pending' | 'active' | 'done' | 'error';
}

interface StoryPreview {
  id: string;
  title: string;
  source_name?: string;
}

interface FeedBuildProgressProps {
  topicId: string;
  topicSlug: string;
  topicName: string;
  sourceIds: string[];
  onComplete: (stories: StoryPreview[]) => void;
  onError: (error: string) => void;
}

const ENCOURAGING_MESSAGES = [
  "Connecting to your sources…",
  "Scanning for the latest stories…",
  "Building something great for your audience…",
  "Almost there — curating content…",
  "Your feed is coming alive…",
];

export const FeedBuildProgress = ({
  topicId,
  topicSlug,
  topicName,
  sourceIds,
  onComplete,
  onError,
}: FeedBuildProgressProps) => {
  const [phases, setPhases] = useState<BuildPhase[]>([
    { key: 'sources', label: 'Sources connected', status: 'pending' },
    { key: 'gather', label: 'Gathering stories', status: 'pending' },
    { key: 'generate', label: 'Generating your feed', status: 'pending' },
  ]);
  const [stories, setStories] = useState<StoryPreview[]>([]);
  const [messageIndex, setMessageIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const hasStarted = useRef(false);

  // Rotate encouraging messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % ENCOURAGING_MESSAGES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Smooth progress animation
  useEffect(() => {
    const doneCount = phases.filter((p) => p.status === 'done').length;
    const activeCount = phases.filter((p) => p.status === 'active').length;
    const target = ((doneCount + activeCount * 0.5) / phases.length) * 100;
    
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= target) return target;
        return Math.min(prev + 0.5, target);
      });
    }, 30);
    return () => clearInterval(interval);
  }, [phases]);

  const updatePhase = (key: string, status: BuildPhase['status']) => {
    setPhases((prev) =>
      prev.map((p) => (p.key === key ? { ...p, status } : p))
    );
  };

  // Main build orchestration
  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    runBuild();
  }, []);

  const runBuild = async () => {
    try {
      // Phase 1: Link sources
      updatePhase('sources', 'active');
      
      for (const sourceId of sourceIds) {
        try {
          await supabase.rpc('add_source_to_topic', {
            p_topic_id: topicId,
            p_source_id: sourceId,
            p_source_config: {},
          });
        } catch (e) {
          console.warn('Source link error (may already exist):', e);
        }
      }
      
      updatePhase('sources', 'done');

      // Phase 2: Trigger scraper
      updatePhase('gather', 'active');
      
      try {
        await supabase.functions.invoke('universal-topic-scraper', {
          body: { topicId, mode: 'full' },
        });
      } catch (e) {
        console.warn('Scraper invocation error:', e);
        // Continue — scraper may be async/queued
      }

      // Poll for articles appearing
      let articleCount = 0;
      const maxPolls = 20;
      for (let i = 0; i < maxPolls; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        
        const { count } = await supabase
          .from('topic_articles')
          .select('id', { count: 'exact', head: true })
          .eq('topic_id', topicId);
        
        articleCount = count || 0;
        if (articleCount >= 3) break;
      }

      updatePhase('gather', 'done');

      // Phase 3: Generate feed content (auto-simplify)
      updatePhase('generate', 'active');

      if (articleCount > 0) {
        try {
          await supabase.functions.invoke('auto-simplify-queue', {
            body: { topicId, limit: 5 },
          });
        } catch (e) {
          console.warn('Auto-simplify error:', e);
        }

        // Poll for stories
        let foundStories: StoryPreview[] = [];
        for (let i = 0; i < 10; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          
          const { data } = await supabase
            .from('stories')
            .select('id, title, topic_article_id, topic_articles!inner(topic_id)')
            .eq('topic_articles.topic_id', topicId)
            .order('created_at', { ascending: false })
            .limit(5) as any;
          
          if (data && data.length > 0) {
            foundStories = data.map((s: any) => ({
              id: s.id,
              title: s.title,
            }));
            setStories(foundStories);
            if (foundStories.length >= 3) break;
          }
        }
      }

      updatePhase('generate', 'done');
      setProgress(100);
      
      // Small delay for the animation to settle
      await new Promise((r) => setTimeout(r, 800));
      onComplete(stories);
    } catch (error) {
      console.error('Build error:', error);
      onError(error instanceof Error ? error.message : 'Build failed');
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-10">
      {/* Title */}
      <div className="text-center space-y-3">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Building your feed…
        </h2>
        <motion.p
          key={messageIndex}
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-muted-foreground"
        >
          {ENCOURAGING_MESSAGES[messageIndex]}
        </motion.p>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md">
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary rounded-full"
            style={{ width: `${progress}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>
      </div>

      {/* Phase checklist */}
      <div className="space-y-4 w-full max-w-sm">
        {phases.map((phase) => (
          <motion.div
            key={phase.key}
            initial={{ opacity: 0.4 }}
            animate={{ opacity: phase.status !== 'pending' ? 1 : 0.4 }}
            className="flex items-center gap-3"
          >
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors ${
              phase.status === 'done'
                  ? 'bg-accent/30'
                  : phase.status === 'active'
                  ? 'bg-primary/15'
                  : 'bg-muted'
              }`}
            >
              {phase.status === 'done' ? (
                <Check className="w-4 h-4 text-accent-foreground" />
              ) : phase.status === 'active' ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : (
                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30" />
              )}
            </div>
            <span
              className={`text-sm font-medium ${
                phase.status === 'done'
                  ? 'text-foreground'
                  : phase.status === 'active'
                  ? 'text-foreground'
                  : 'text-muted-foreground'
              }`}
            >
              {phase.label}
            </span>
          </motion.div>
        ))}
      </div>

      {/* Live story previews sliding in */}
      <AnimatePresence>
        {stories.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-sm space-y-2"
          >
            <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium mb-3">
              Stories found
            </p>
            {stories.slice(0, 3).map((story, i) => (
              <motion.div
                key={story.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border"
              >
                <Newspaper className="w-4 h-4 shrink-0 text-primary" />
                <span className="text-sm truncate">{story.title}</span>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
