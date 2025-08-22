import { Card } from "@/components/ui/card";
import { ExternalLink } from "lucide-react";

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  story: {
    id: string;
    title: string;
    author: string | null;
    publication_name: string | null;
    created_at: string;
    article: {
      source_url: string;
      region: string;
    };
  };
}

interface FeedSlideProps {
  slide: Slide;
  topicName: string;
}

export function FeedSlide({ slide, topicName }: FeedSlideProps) {
  return (
    <Card className="overflow-hidden">
      <div className="p-8">
        {/* Main Content */}
        <div className="mb-8">
          <p className="text-2xl leading-relaxed font-light text-foreground">
            {slide.content}
          </p>
        </div>

        {/* Bottom Attribution */}
        <div className="flex items-center justify-between text-sm text-muted-foreground border-t pt-4">
          <div className="flex items-center gap-2">
            <span className="font-medium">{topicName}</span>
            {slide.story.publication_name && (
              <>
                <span>•</span>
                <span>{slide.story.publication_name}</span>
              </>
            )}
          </div>
          <a
            href={slide.story.article.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:text-primary transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            <span>Source</span>
          </a>
        </div>
      </div>
    </Card>
  );
}