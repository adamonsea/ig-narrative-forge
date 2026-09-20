import React from 'react';
import { getPublicationLabel, getSourceDomain } from '@/lib/storyAttribution';

interface Slide {
  id: string;
  slide_number: number;
  content: string;
}

interface Story {
  id: string;
  title: string;
  slides: Slide[];
  author?: string | null;
  publication_name?: string | null;
  article?: {
    source_url: string;
    region?: string;
    published_at?: string | null;
  };
}

export type SlideAspect = 'square' | 'story';

export const SLIDE_DIMENSIONS: Record<SlideAspect, { width: number; height: number }> = {
  square: { width: 1080, height: 1080 },
  story: { width: 1080, height: 1920 },
};

interface ExportableSlideRendererProps {
  story: Story;
  slideIndex: number;
  topicName: string;
  aspect?: SlideAspect;
}

/**
 * A simplified slide renderer optimized for export.
 * Uses inline styles to ensure consistent rendering during html2canvas capture.
 */
export const ExportableSlideRenderer: React.FC<ExportableSlideRendererProps> = ({ 
  story, 
  slideIndex, 
  topicName,
  aspect = 'square'
}) => {
  const currentSlide = story.slides[slideIndex];
  const isFirstSlide = slideIndex === 0;
  const { width, height } = SLIDE_DIMENSIONS[aspect];
  const scale = aspect === 'story' ? 1.15 : 1;

  // Dynamic text sizing based on content length
  const getTextStyles = (content: string, isTitle: boolean): React.CSSProperties => {
    const length = content.length;
    if (isTitle) {
      const fontSize = length < 50 ? 72 : length < 100 ? 60 : 48;
      return {
        fontSize: `${Math.round(fontSize * scale)}px`,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        lineHeight: 1.2,
        letterSpacing: '-0.02em'
      };
    }
    const fontSize = length < 80 ? 48 : length < 150 ? 40 : length < 250 ? 32 : 28;
    return {
      fontSize: `${Math.round(fontSize * scale)}px`,
      fontWeight: 300,
      lineHeight: 1.4
    };
  };

  const sourceDomain = getSourceDomain(story.article?.source_url);
  const publicationLabel = getPublicationLabel(story.publication_name, story.article?.source_url);
  const bylineText = story.author
    ? `By ${story.author}`
    : publicationLabel
      ? `Source: ${publicationLabel}`
      : '';

  const textStyles = getTextStyles(currentSlide.content, isFirstSlide);

  return (
    <div 
      className="exportable-slide-renderer"
      style={{ 
        width: `${width}px`, 
        height: `${height}px`,
        backgroundColor: '#ffffff',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: aspect === 'story' ? '64px 48px 24px' : '24px 32px',
        borderBottom: '1px solid #e5e7eb'
      }}>
        <span style={{ 
          fontSize: '24px', 
          fontWeight: 600,
          color: '#111827'
        }}>
          {topicName}
        </span>
        <span style={{ 
          fontSize: '20px',
          color: '#6b7280'
        }}>
          {slideIndex + 1} of {story.slides.length}
        </span>
      </div>

      {/* Main Content */}
      <div style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: aspect === 'story' ? '80px 80px' : '60px 80px',
        textAlign: 'center'
      }}>
        <div style={{
          maxWidth: '920px',
          color: '#111827',
          ...textStyles
        }}>
          {currentSlide.content}
        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: aspect === 'story' ? '24px 48px 72px' : '24px 32px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ 
          fontSize: '18px',
          color: '#6b7280'
        }}>
          {bylineText}
        </span>
        {sourceDomain && (
          <span style={{
            fontSize: '16px',
            color: '#9ca3af',
            backgroundColor: '#f3f4f6',
            padding: '8px 16px',
            borderRadius: '20px'
          }}>
            {sourceDomain}
          </span>
        )}
      </div>
    </div>
  );
};
