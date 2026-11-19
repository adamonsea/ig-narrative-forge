import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { WorkspaceDrawer } from '@/components/workspace/WorkspaceDrawer';
import { RotateCcw, Film, Lock, Images } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import { CREDIT_COSTS } from '@/lib/creditService';
import { StoryReelPreview } from './StoryReelPreview';
import { buildReelContent } from './storyReelContent';
import { recordReel, exportReelSlides } from './recordReel';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ReelStudioStory {
  id: string;
  title: string;
  cover_illustration_url?: string | null | undefined;
  slides?: { slide_number: number; content: string }[] | null | undefined;
}

interface ReelStudioModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  story: ReelStudioStory;
  brandName: string;
  feedUrl: string;
  sourceLabel: string;
  /** Whether the user's tier unlocks the reel feature. */
  featureUnlocked: boolean;
}

const REEL_COST = CREDIT_COSTS.STORY_REEL;

export const ReelStudioModal = ({
  open,
  onOpenChange,
  story,
  brandName,
  feedUrl,
  sourceLabel,
  featureUnlocked,
}: ReelStudioModalProps) => {
  const { credits } = useCredits();
  const [playKey, setPlayKey] = useState(1);
  const [rendering, setRendering] = useState(false);
  const [exportingSlides, setExportingSlides] = useState(false);
  const { toast } = useToast();

  const content = useMemo(
    () => buildReelContent(story, { brandName, feedUrl, sourceLabel }),
    [story, brandName, feedUrl, sourceLabel]
  );

  const balance = credits?.credits_balance ?? 0;
  const hasEnough = featureUnlocked || balance >= REEL_COST;

  const handleRender = async () => {
    if (rendering) return;
    setRendering(true);
    const idempotencyKey = `story_reel:${story.id}:${Date.now()}`;
    let reserved = false;
    try {
      const { data: charge, error: chargeError } = await supabase.functions.invoke(
        'charge-studio-action',
        { body: { action: 'story_reel', storyId: story.id, phase: 'reserve', idempotencyKey } }
      );
      if (chargeError || !charge?.success) {
        throw new Error(charge?.error || 'Not enough credits to render this reel.');
      }
      reserved = (charge?.credits_used ?? 0) > 0;

      await recordReel(content);

      if (reserved) {
        await supabase.functions.invoke('charge-studio-action', {
          body: { action: 'story_reel', storyId: story.id, phase: 'settle', idempotencyKey },
        });
        reserved = false;
      }
      toast({ title: 'Reel downloaded', description: 'Your teaser video has been saved.' });
    } catch (err) {
      if (reserved) {
        await supabase.functions.invoke('charge-studio-action', {
          body: { action: 'story_reel', storyId: story.id, phase: 'release', idempotencyKey },
        });
      }
      console.error('Reel render failed:', err);
      toast({
        title: 'Render failed',
        description: err instanceof Error ? err.message : 'Could not generate the reel.',
        variant: 'destructive',
      });
    } finally {
      setRendering(false);
    }
  };

  const handleExportSlides = async () => {
    if (exportingSlides) return;
    setExportingSlides(true);
    try {
      await exportReelSlides(content);
      toast({ title: 'Slides downloaded', description: 'Three static slides have been saved.' });
    } catch (err) {
      console.error('Slide export failed:', err);
      toast({
        title: 'Export failed',
        description: err instanceof Error ? err.message : 'Could not export the slides.',
        variant: 'destructive',
      });
    } finally {
      setExportingSlides(false);
    }
  };

  return (
    <WorkspaceDrawer open={open} onOpenChange={onOpenChange} title="Reel" srDescription="A short 9:16 teaser of this story." size="xl">
      <div className="grid gap-6 md:grid-cols-[240px_1fr]">
        <div className="mx-auto w-[240px] space-y-3">
          <StoryReelPreview content={content} playKey={playKey} />
          <Button size="sm" variant="outline" className="w-full" onClick={() => setPlayKey((k) => k + 1)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Replay
          </Button>
        </div>

        <div className="flex flex-col gap-4">
          <div className="space-y-2 rounded-xl border border-border p-4 text-base">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Video</span>
              <span className="tabular-nums">{REEL_COST} credits</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Balance</span>
              <span className={hasEnough ? 'tabular-nums' : 'tabular-nums text-destructive'}>{balance} credits</span>
            </div>
          </div>

          {!featureUnlocked ? (
            <p className="flex items-center gap-2 text-base text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
              Video download is on Pro.
            </p>
          ) : (
            <Button disabled={!hasEnough || rendering} className="w-full" onClick={handleRender}>
              <Film className="mr-2 h-4 w-4" />
              {rendering ? 'Rendering' : 'Download video'}
            </Button>
          )}

          <Button variant="outline" className="w-full" onClick={handleExportSlides} disabled={exportingSlides}>
            <Images className="mr-2 h-4 w-4" />
            {exportingSlides ? 'Exporting' : 'Download 3 pictures'}
          </Button>
        </div>
      </div>
    </WorkspaceDrawer>
  );
};
