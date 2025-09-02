import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface Slide {
  id: string;
  slide_number: number;
  content: string;
}

interface Story {
  id: string;
  title: string;
  author: string | null;
  publication_name: string | null;
  created_at: string;
  slides: Slide[];
  article: {
    source_url: string;
    region: string;
  };
}

interface CarouselSlideRendererProps {
  story: Story;
  slideIndex: number;
  topicName: string;
}

export const CarouselSlideRenderer: React.FC<CarouselSlideRendererProps> = ({ 
  story, 
  slideIndex, 
  topicName 
}) => {
  const currentSlide = story.slides[slideIndex];
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === story.slides.length - 1;

  // Parse content for last slide styling and ensure source attribution
  const parseContentForLastSlide = (content: string) => {
    if (!isLastSlide) return { mainContent: content, ctaContent: null, sourceUrl: null };
    
    const ctaPatterns = [
      /Like, share\./i,
      /Summarised by/i,
      /Support local journalism/i
    ];
    
    let splitIndex = -1;
    for (const pattern of ctaPatterns) {
      const match = content.search(pattern);
      if (match !== -1) {
        splitIndex = match;
        break;
      }
    }
    
    let mainContent = content;
    let ctaContent = null;
    
    if (splitIndex !== -1) {
      mainContent = content.substring(0, splitIndex).trim();
      ctaContent = content.substring(splitIndex).trim().replace(/^Comment, like, share\.\s*/i, 'Like, share. ');
    }
    
    // Always add source attribution on final slide
    const sourceDomain = story.article.source_url ? 
      new URL(story.article.source_url).hostname.replace('www.', '') : 
      'source';
    
    const sourceAttribution = `Read the full story at ${sourceDomain}`;
    
    // If we have existing CTA content, append source; otherwise, use source as CTA content
    const finalCtaContent = ctaContent ? 
      `${ctaContent}\n\n${sourceAttribution}` : 
      sourceAttribution;
    
    return {
      mainContent,
      ctaContent: finalCtaContent,
      sourceUrl: story.article.source_url
    };
  };

  const { mainContent, ctaContent, sourceUrl } = parseContentForLastSlide(currentSlide.content);

  // Dynamic text sizing (same logic as StoryCarousel)
  const getTextSize = (content: string, isTitle: boolean) => {
    const length = content.length;
    if (isTitle) {
      if (length < 50) return "text-5xl";
      if (length < 100) return "text-4xl";
      return "text-3xl";
    } else {
      if (length < 80) return "text-3xl";
      if (length < 150) return "text-2xl";
      if (length < 250) return "text-xl";
      return "text-lg";
    }
  };

  return (
    <div 
      className="carousel-slide-renderer"
      style={{ 
        width: '1080px', 
        height: '1080px',
        position: 'absolute',
        top: '0',
        left: '-100vw',
        zIndex: -1000,
        visibility: 'hidden'
      }}
    >
      <Card className="overflow-hidden w-full h-full">
        <div className="relative bg-background h-full flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b">
            <Badge variant="secondary" className="text-lg font-medium">
              {topicName}
            </Badge>
            <span className="text-lg text-muted-foreground">
              {slideIndex + 1} of {story.slides.length}
            </span>
          </div>

          {/* Slide Content */}
          <div className="flex-1 flex items-center justify-center p-12">
            <div className="w-full max-w-4xl">
              <div className={`text-center leading-relaxed ${
                isFirstSlide 
                  ? `${getTextSize(currentSlide.content, true)} font-bold uppercase text-balance` 
                  : `${getTextSize(isLastSlide ? mainContent : currentSlide.content, false)} font-light text-balance`
              }`}>
                {/* Main story content */}
                {isLastSlide ? mainContent : currentSlide.content}
                    
                {/* CTA content with special styling on last slide */}
                {isLastSlide && ctaContent && (
                  <div className="mt-6 pt-6 border-t border-muted">
                    <div 
                      className="text-xl font-bold text-muted-foreground text-balance"
                      dangerouslySetInnerHTML={{
                        __html: ctaContent
                          .replace(
                            /visit ([^\s]+)/gi, 
                            'visit <span class="text-primary font-extrabold">$1</span>'
                          )
                          .replace(
                            /call (\d{5}\s?\d{6})/gi,
                            'call <span class="text-primary font-extrabold">$1</span>'
                          )
                          .replace(
                            /Read the full story at ([^\s\n]+)/gi,
                            sourceUrl ? 
                              `<a href="${sourceUrl}" target="_blank" rel="noopener noreferrer" class="text-primary hover:text-primary/80 underline transition-colors font-extrabold">Read the full story at $1</a>` :
                              'Read the full story at <span class="text-primary font-extrabold">$1</span>'
                          )
                      }}
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer with attribution */}
          <div className="p-6 border-t">
            <div className="text-center text-lg text-muted-foreground">
              {story.author ? `Story by ${story.author}` : 'Source: Local News'}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};