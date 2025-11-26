import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Heart, Loader2 } from 'lucide-react';
import { StoryCard } from '@/components/StoryCard';
import { toast } from 'sonner';

interface Story {
  id: string;
  title: string;
  author: string | null;
  cover_illustration_url: string | null;
  created_at: string;
  article: {
    source_url: string;
    published_at?: string | null;
  } | null;
}

interface LikedStoriesDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicSlug: string;
  fetchLikedStories: () => Promise<Story[]>;
}

export const LikedStoriesDrawer = ({ 
  open, 
  onOpenChange, 
  topicSlug,
  fetchLikedStories 
}: LikedStoriesDrawerProps) => {
  const [stories, setStories] = useState<Story[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadStories();
    }
  }, [open]);

  const loadStories = async () => {
    setLoading(true);
    try {
      const likedStories = await fetchLikedStories();
      setStories(likedStories);
    } catch (error) {
      console.error('Error loading liked stories:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="h-[80vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Heart className="w-5 h-5 fill-primary text-primary" />
            Liked Stories
          </SheetTitle>
          <SheetDescription>
            {stories.length === 0 
              ? "Stories you like will appear here"
              : `${stories.length} liked ${stories.length === 1 ? 'story' : 'stories'}`}
          </SheetDescription>
        </SheetHeader>

        {stories.length > 0 && (
          <div className="mt-4 pb-4 border-b">
            <Button
              onClick={() => {
                const shareText = `Check out my favourite stories from ${topicSlug}!`;
                const shareUrl = `${window.location.origin}/feed/${topicSlug}`;
                
                if (navigator.share) {
                  navigator.share({
                    title: `My Favourites - ${topicSlug}`,
                    text: shareText,
                    url: shareUrl
                  }).catch(() => {
                    // User cancelled share
                  });
                } else {
                  // Fallback: copy to clipboard
                  navigator.clipboard.writeText(`${shareText}\n${shareUrl}`);
                  toast.success('Link copied to clipboard!');
                }
              }}
              variant="outline"
              className="w-full gap-2"
            >
              <Heart className="w-4 h-4 fill-primary text-primary" />
              Share Your Favourites
            </Button>
          </div>
        )}

        <div className="mt-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : stories.length === 0 ? (
            <div className="text-center py-12">
              <Heart className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground">
                No liked stories yet. Start swiping!
              </p>
            </div>
          ) : (
            <div className="grid gap-4 pb-6">
              {stories.map(story => (
                <StoryCard key={story.id} story={story} topicSlug={topicSlug} />
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
