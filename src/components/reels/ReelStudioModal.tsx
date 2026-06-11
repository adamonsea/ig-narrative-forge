import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Play, RotateCcw, Film, Coins, Lock, Sparkles } from 'lucide-react';
import { useCredits } from '@/hooks/useCredits';
import { CREDIT_COSTS } from '@/lib/creditService';
import { StoryReelPreview } from './StoryReelPreview';
import { buildReelContent } from './storyReelContent';

interface ReelStudioStory {
  id: string;
  title: string;
  cover_illustration_url?: string | null;
  slides?: { slide_number: number; content: string }[] | null;
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

  const content = useMemo(
    () => buildReelContent(story, { brandName, feedUrl, sourceLabel }),
    [story, brandName, feedUrl, sourceLabel]
  );

  const balance = credits?.credits_balance ?? 0;
  const hasEnough = balance >= REEL_COST;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Film className="w-4 h-4" />
            Reel Studio
          </DialogTitle>
          <DialogDescription>
            A short 9:16 teaser — headline, one key detail, then a link to the
            full story on your feed. Preview is free; the high-res MP4 costs
            credits.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-[260px_1fr]">
          {/* Preview */}
          <div className="mx-auto w-[240px]">
            <StoryReelPreview content={content} playKey={playKey} />
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                className="flex-1"
                onClick={() => setPlayKey((k) => k + 1)}
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                Replay
              </Button>
            </div>
          </div>

          {/* Controls */}
          <div className="flex flex-col gap-4">
            <div className="space-y-2">
              <p className="text-sm font-medium">Teaser beats</p>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                <li>Headline</li>
                <li>Key detail</li>
                <li>Read more on your feed</li>
              </ol>
            </div>

            <div className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Coins className="w-3 h-3" /> Render cost
                </span>
                <Badge variant="secondary">{REEL_COST} credits</Badge>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Your balance</span>
                <span className={hasEnough ? '' : 'text-destructive'}>
                  {balance} credits
                </span>
              </div>
            </div>

            {!featureUnlocked ? (
              <div className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground flex items-start gap-2">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <span>
                  Reel export is a premium feature. Upgrade your plan to render
                  and download MP4 reels.
                </span>
              </div>
            ) : (
              <Button disabled={!hasEnough} className="w-full">
                <Sparkles className="w-4 h-4 mr-1" />
                Render &amp; Download MP4
              </Button>
            )}

            {featureUnlocked && !hasEnough && (
              <p className="text-xs text-destructive">
                You need {REEL_COST} credits to render this reel.
              </p>
            )}

            <p className="text-xs text-muted-foreground">
              High-res MP4 rendering is being finalised. The browser preview
              above shows the exact pacing and layout of the final reel.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};