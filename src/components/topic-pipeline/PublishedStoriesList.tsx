import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ExternalLink, Archive, RotateCcw, Eye, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  word_count?: number;
  alt_text?: string;
  visual_prompt?: string;
}

interface PublishedStory {
  id: string;
  title?: string; // Make optional to match MultiTenantStory
  headline?: string; // Keep headline for compatibility  
  summary?: string;
  author?: string;
  status: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
  slides: Slide[];
  article_id?: string;
  topic_article_id?: string;
  story_type?: 'legacy' | 'multi_tenant';
}

interface PublishedStoriesListProps {
  stories: PublishedStory[];
  onArchive: (storyId: string, title: string) => void;
  onReturnToReview: (storyId: string) => void;
  onDelete: (storyId: string, title: string) => void;
  onViewStory: (story: PublishedStory) => void;
  onRefresh: () => void;
  loading?: boolean;
}

export const PublishedStoriesList: React.FC<PublishedStoriesListProps> = ({
  stories,
  onArchive,
  onReturnToReview,
  onDelete,
  onViewStory,
  onRefresh,
  loading = false
}) => {
  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse">
            <div className="h-32 bg-muted rounded-lg"></div>
          </div>
        ))}
      </div>
    );
  }

  if (stories.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
          <Eye className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="mb-2 text-lg font-semibold">No Published Stories</h3>
        <p className="mb-4 text-muted-foreground">
          Published stories will appear here when approved from arrivals.
        </p>
        <Button variant="outline" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>
    );
  }

  const getStatusColor = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'default';
    if (story.status === 'ready') return 'secondary';
    return 'outline';
  };

  const getStatusLabel = (story: PublishedStory) => {
    if (story.is_published && story.status === 'published') return 'Live';
    if (story.status === 'ready') return 'Ready';
    return 'Draft';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {stories.length} published {stories.length === 1 ? 'story' : 'stories'}
        </div>
        <Button variant="outline" size="sm" onClick={onRefresh}>
          <RotateCcw className="mr-2 h-4 w-4" />
          Refresh
        </Button>
      </div>

      {stories.map((story) => (
        <Card key={story.id} className="relative">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <CardTitle className="text-base font-medium leading-tight mb-2">
                  {story.title || story.headline}
                </CardTitle>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={getStatusColor(story)} className="text-xs">
                    {getStatusLabel(story)}
                  </Badge>
                  {story.author && (
                    <>
                      <span>•</span>
                      <span>{story.author}</span>
                    </>
                  )}
                  <span>•</span>
                  <span>{formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}</span>
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="pt-0">
            {story.summary && (
              <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                {story.summary}
              </p>
            )}

            {/* Slides Preview */}
            {story.slides.length > 0 && (
              <div className="mb-4">
                <div className="text-xs font-medium text-muted-foreground mb-2">
                  {story.slides.length} slide{story.slides.length !== 1 ? 's' : ''}
                </div>
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {story.slides.slice(0, 3).map((slide, index) => (
                    <div
                      key={slide.id}
                      className="flex-shrink-0 w-20 h-12 bg-muted rounded border text-xs p-1 overflow-hidden"
                      title={slide.content}
                    >
                      <div className="text-[10px] font-medium text-muted-foreground">
                        {slide.slide_number || index + 1}
                      </div>
                      <div className="text-[9px] leading-tight line-clamp-2">
                        {slide.content.substring(0, 40)}...
                      </div>
                    </div>
                  ))}
                  {story.slides.length > 3 && (
                    <div className="flex-shrink-0 w-20 h-12 bg-muted rounded border text-xs flex items-center justify-center text-muted-foreground">
                      +{story.slides.length - 3}
                    </div>
                  )}
                </div>
              </div>
            )}

            <Separator className="my-4" />

            {/* Action Buttons */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onViewStory(story)}
                className="h-8"
              >
                <Eye className="mr-1 h-3 w-3" />
                View
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onArchive(story.id, story.title || story.headline || 'Untitled')}
                className="h-8"
              >
                <Archive className="mr-1 h-3 w-3" />
                Archive
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onReturnToReview(story.id)}
                className="h-8"
              >
                <RotateCcw className="mr-1 h-3 w-3" />
                Return
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => onDelete(story.id, story.title || story.headline || 'Untitled')}
                className="h-8 text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-3 w-3" />
                Delete
              </Button>

              {story.is_published && (
                <Button
                  variant="ghost"
                  size="sm"
                  asChild
                  className="h-8 ml-auto"
                >
                  <a 
                    href={`/story/${story.id}`} 
                    target="_blank" 
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};