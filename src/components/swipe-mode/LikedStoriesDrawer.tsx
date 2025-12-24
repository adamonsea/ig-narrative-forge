import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Heart, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import { buildShareUrl } from '@/lib/urlUtils';

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

  const extractDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return '';
    }
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return '';
    try {
      return format(new Date(dateString), 'MMM d');
    } catch {
      return '';
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
                const shareUrl = buildShareUrl(`/feed/${topicSlug}`);
                
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

        <div className="mt-4">
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
            <div className="divide-y divide-border">
              {stories.map(story => {
                const sourceUrl = story.article?.source_url;
                const domain = sourceUrl ? extractDomain(sourceUrl) : '';
                const date = formatDate(story.article?.published_at || story.created_at);
                
                return (
                  <Link 
                    key={story.id} 
                    to={`/story/${story.id}`}
                    className="flex items-start gap-3 py-3 hover:bg-muted/50 transition-colors -mx-2 px-2 rounded-md"
                  >
                    {/* Thumbnail */}
                    {story.cover_illustration_url ? (
                      <img 
                        src={story.cover_illustration_url} 
                        alt=""
                        className="w-20 h-14 object-cover rounded-md flex-shrink-0 bg-muted"
                      />
                    ) : (
                      <div className="w-20 h-14 rounded-md flex-shrink-0 bg-muted flex items-center justify-center">
                        <Heart className="w-5 h-5 text-muted-foreground" />
                      </div>
                    )}
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-medium leading-snug line-clamp-2 text-foreground">
                        {story.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                        {domain && <span>{domain}</span>}
                        {domain && date && <span>•</span>}
                        {date && <span>{date}</span>}
                      </div>
                    </div>
                    
                    {/* External link indicator */}
                    <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-1" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
