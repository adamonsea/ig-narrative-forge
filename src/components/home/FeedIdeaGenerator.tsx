import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { savePendingBlueprint, type FeedBlueprint } from '@/lib/feedBlueprint';
import { BlueprintAccountDialog } from './BlueprintAccountDialog';
import { useIsMobile } from '@/hooks/use-mobile';

export const FeedIdeaGenerator = () => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState('');
  const [blueprints, setBlueprints] = useState<FeedBlueprint[]>([]);
  const [chosen, setChosen] = useState<FeedBlueprint | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = input.trim();
    if (value.length < 2) return;
    setLoading(true);
    setError(null);
    setBlueprints([]);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('feed-ideas', {
        body: { input: value },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setSummary(data?.summary ?? '');
      setBlueprints(data?.blueprints ?? []);
    } catch (err: any) {
      setError(
        typeof err?.message === 'string' && err.message.length < 140
          ? err.message
          : 'We could not generate ideas just now. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  const build = (blueprint: FeedBlueprint) => {
    savePendingBlueprint(blueprint, input.trim());
    if (user) {
      navigate('/dashboard');
      return;
    }
    setChosen(blueprint);
    setAccountOpen(true);
  };

  return (
    <div className="mx-auto w-full max-w-4xl pt-6">
      <form onSubmit={generate} className="group relative mx-auto w-full max-w-3xl">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 hidden rounded-full bg-gradient-to-r from-[hsl(270,100%,68%)]/30 to-[hsl(155,100%,67%)]/30 opacity-50 blur-xl transition-opacity duration-500 group-focus-within:opacity-100 sm:block"
        />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-2 sm:rounded-full sm:border sm:border-white/10 sm:bg-white/5 sm:p-2 sm:shadow-2xl sm:backdrop-blur-md sm:transition-all sm:duration-300 sm:focus-within:border-white/25 sm:focus-within:bg-white/10">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your niche or topic"
            aria-label="Your niche or topic"
            className="h-14 w-full min-w-0 flex-1 rounded-2xl border border-white/20 bg-white/10 px-5 text-center text-lg text-white shadow-[0_0_30px_-8px_rgba(173,92,255,0.5)] placeholder:text-white/70 focus-visible:border-[hsl(155,100%,67%)]/60 focus-visible:ring-0 focus-visible:ring-offset-0 sm:rounded-full sm:border-none sm:bg-transparent sm:px-6 sm:text-left sm:font-light sm:shadow-none md:text-xl"
          />
          <Button
            type="submit"
            disabled={loading || input.trim().length < 2}
            className="h-14 w-full shrink-0 rounded-2xl bg-[hsl(155,100%,67%)] px-8 text-lg font-bold text-[hsl(214,50%,9%)] shadow-lg transition-all hover:bg-[hsl(155,100%,60%)] hover:shadow-[0_0_28px_rgba(87,255,185,0.3)] active:scale-95 disabled:opacity-100 sm:w-auto sm:rounded-full sm:disabled:opacity-60"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            {loading ? 'Thinking…' : 'Show me feed ideas'}
            {!loading ? <ArrowRight className="ml-2 h-5 w-5 sm:hidden" /> : null}
          </Button>
        </div>
      </form>

      <div className="flex items-center justify-center gap-3 pt-6">
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[hsl(155,100%,67%)]" />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80 md:text-base md:tracking-[0.2em]">
          Free to create
        </p>
        <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[hsl(155,100%,67%)]" />
      </div>

      {error && <p className="pt-4 text-center text-base md:text-sm text-[hsl(0,80%,75%)]">{error}</p>}

      <AnimatePresence>
        {blueprints.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className="pt-10"
          >
            {summary && <p className="pb-6 text-center text-lg md:text-base text-white/60">{summary}</p>}
            <div className="grid gap-5 text-left md:grid-cols-3">
              {blueprints.map((bp, i) => (
                <motion.div
                  key={`${bp.feed_title}-${i}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.1, duration: 0.45 }}
                  className="flex flex-col rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-sm"
                >
                  <span className="text-xs uppercase tracking-wider text-[hsl(155,100%,67%)]">
                    {bp.audience_type}
                  </span>
                  <h3 className="pt-2 font-display text-2xl text-white">{bp.feed_title}</h3>
                  <p className="pt-2 text-base leading-relaxed text-white/80">{bp.purpose}</p>

                  {(bp.sample_story_hooks || []).length > 0 && (
                    <div className="flex-1 pt-4">
                      <button
                        type="button"
                        onClick={() => toggle(i)}
                        aria-expanded={expanded.has(i)}
                        className="flex items-center gap-1.5 text-sm md:text-xs text-white/50 transition-colors hover:text-white/80"
                      >
                        <ChevronDown
                          className={`h-3.5 w-3.5 transition-transform ${expanded.has(i) ? 'rotate-180' : ''}`}
                        />
                        Example stories
                      </button>
                      {expanded.has(i) && (
                        <ul className="flex-1 space-y-2 pt-3">
                          {(bp.sample_story_hooks || []).slice(0, 3).map((hook, h) => (
                            <li key={h} className="border-l border-white/15 pl-3 text-base md:text-sm text-white/75">
                              {hook}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={() => build(bp)}
                    className="mt-6 w-full rounded-full bg-white text-[hsl(214,50%,9%)] hover:bg-white/90"
                  >
                    Build this feed
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <BlueprintAccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        blueprint={chosen}
        input={input.trim()}
      />
    </div>
  );
};
