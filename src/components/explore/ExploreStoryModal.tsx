import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { StoryRatingCard } from '@/components/swipe-mode/StoryRatingCard';

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

interface ExploreStoryModalProps {
  story: Story | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicSlug: string;
}

export function ExploreStoryModal({ story, open, onOpenChange, topicSlug }: ExploreStoryModalProps) {
  const { user } = useAuth();

  if (!story) return null;

  const sourceDomain = (() => {
    try {
      return story.article?.source_url 
        ? new URL(story.article.source_url).hostname.replace('www.', '')
        : null;
    } catch {
      return null;
    }
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] overflow-hidden p-0 flex flex-col">
        {/* Close button */}
        <Button
          onClick={() => onOpenChange(false)}
          variant="ghost"
          size="sm"
          className="absolute top-4 right-4 z-50 gap-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
          Close ✕
        </Button>

        <div className="flex-1 overflow-y-auto pb-24">
          {/* Cover Image */}
          {story.cover_illustration_url && (
            <div className="w-full aspect-[21/9] md:aspect-video overflow-hidden bg-muted">
              <img
                src={story.cover_illustration_url}
                alt={story.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          
          {/* Story Content */}
          <div className="p-6 md:p-8 space-y-6">
            {/* Source pill */}
            {sourceDomain && story.article?.source_url && (
              <a 
                href={story.article.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex"
              >
                <Badge variant="secondary" className="text-xs hover:bg-secondary/80 cursor-pointer">
                  <ExternalLink className="w-3 h-3 mr-1" />
                  {sourceDomain}
                </Badge>
              </a>
            )}
            
            {story.slides && story.slides.length > 0 ? (
              story.slides
                .sort((a, b) => a.slide_number - b.slide_number)
                .map(slide => (
                  <div 
                    key={slide.slide_number} 
                    className="text-foreground"
                    style={{ color: 'hsl(var(--foreground))' }}
                  >
                    <div 
                      className="prose prose-lg md:prose-xl max-w-none [&_h1]:font-extrabold [&_h2]:font-bold [&_h3]:font-bold [&_p:first-of-type]:text-xl [&_p:first-of-type]:font-semibold [&_p:first-of-type]:leading-snug"
                      style={{ 
                        color: 'hsl(var(--foreground))',
                        '--tw-prose-body': 'hsl(var(--foreground))',
                        '--tw-prose-headings': 'hsl(var(--foreground))',
                        '--tw-prose-bold': 'hsl(var(--foreground))',
                        '--tw-prose-links': 'hsl(var(--primary))',
                      } as React.CSSProperties}
                      dangerouslySetInnerHTML={{ __html: slide.content }} 
                    />
                  </div>
                ))
            ) : (
              <div className="p-8 text-center space-y-4">
                <p className="text-muted-foreground">Story content loading...</p>
              </div>
            )}
          </div>
        </div>
        
        {/* Fixed CTAs at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 md:p-6 bg-background border-t shadow-lg z-50">
          <div className="space-y-3">
            {user && <StoryRatingCard storyId={story.id} />}
            
            <div className="flex gap-3">
              <Button
                asChild
                size="lg"
                className="flex-1 gap-2 text-base font-semibold"
              >
                <a href={`/feed/${topicSlug}/story/${story.id}`}>
                  Slides
                </a>
              </Button>

              {story.article?.source_url ? (
                <Button
                  asChild
                  size="lg"
                  variant="outline"
                  className="flex-1 gap-2 text-base"
                >
                  <a
                    href={story.article.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Source
                  </a>
                </Button>
              ) : (
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1"
                  disabled
                >
                  Source unavailable
                </Button>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
