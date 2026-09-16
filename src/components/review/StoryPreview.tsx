import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { optimizeImageUrl } from '@/lib/imageOptimization';

export type PreviewStory = {
  id: string;
  slug?: string | null;
  title: string;
  cover_illustration_url?: string | null;
};

type Ctx = { open: (story: PreviewStory) => void };

const StoryPreviewContext = createContext<Ctx>({ open: () => {} });

export const useStoryPreview = () => useContext(StoryPreviewContext);

/** Wraps review content so any cover opens a pop-up instead of a dead archive link. */
export const StoryPreviewProvider = ({
  feedSlug,
  placeLabel,
  children,
}: {
  feedSlug?: string;
  placeLabel?: string;
  children: ReactNode;
}) => {
  const [story, setStory] = useState<PreviewStory | null>(null);
  const open = useCallback((s: PreviewStory) => setStory(s), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <StoryPreviewContext.Provider value={value}>
      {children}
      <Dialog open={story != null} onOpenChange={(o) => !o && setStory(null)}>
        <DialogContent className="max-w-lg overflow-hidden p-0">
          {story && (
            <>
              {story.cover_illustration_url && (
                <img
                  src={
                    optimizeImageUrl(story.cover_illustration_url, { width: 900, height: 700, quality: 80 }) ??
                    story.cover_illustration_url
                  }
                  alt=""
                  className="aspect-[9/7] w-full object-cover"
                />
              )}
              <div className="p-5">
                <DialogTitle className="text-xl font-semibold leading-snug">{story.title}</DialogTitle>
                {feedSlug && (
                  <Link to={`/feed/${feedSlug}`} className="mt-4 inline-block text-sm font-medium text-primary underline">
                    Read in {placeLabel ?? 'the feed'}
                  </Link>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </StoryPreviewContext.Provider>
  );
};
