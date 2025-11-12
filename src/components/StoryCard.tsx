import { Link } from "react-router-dom";
import { format } from "date-fns";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, ExternalLink } from "lucide-react";

interface Story {
  id: string;
  title: string;
  author: string | null;
  cover_illustration_url: string | null;
  created_at: string;
  article: {
    source_url: string;
    published_at?: string;
  };
}

interface StoryCardProps {
  story: Story;
  topicSlug: string;
}

export const StoryCard = ({ story, topicSlug }: StoryCardProps) => {
  const storyDate = story.article?.published_at 
    ? new Date(story.article.published_at)
    : new Date(story.created_at);

  const sourceDomain = story.article?.source_url 
    ? new URL(story.article.source_url).hostname.replace('www.', '')
    : null;

  return (
    <Link to={`/feed/${topicSlug}/story/${story.id}`}>
      <Card className="h-full hover:shadow-lg transition-shadow duration-200 overflow-hidden group">
        {/* Cover Image */}
        {story.cover_illustration_url && (
          <div className="relative w-full aspect-[4/3] overflow-hidden bg-muted">
            <img
              src={story.cover_illustration_url}
              alt={story.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              loading="lazy"
            />
          </div>
        )}

        <CardContent className="p-4">
          {/* Title */}
          <h2 className="text-lg font-semibold line-clamp-3 mb-2 group-hover:text-primary transition-colors">
            {story.title}
          </h2>

          {/* Author */}
          {story.author && (
            <p className="text-sm text-muted-foreground mb-2">
              by {story.author}
            </p>
          )}

          {/* Date */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="w-3 h-3" />
            <time dateTime={storyDate.toISOString()}>
              {format(storyDate, 'MMM d, yyyy')}
            </time>
          </div>
        </CardContent>

        {/* Footer with Source */}
        {sourceDomain && (
          <CardFooter className="p-4 pt-0">
            <Badge variant="secondary" className="text-xs">
              <ExternalLink className="w-3 h-3 mr-1" />
              {sourceDomain}
            </Badge>
          </CardFooter>
        )}
      </Card>
    </Link>
  );
};
