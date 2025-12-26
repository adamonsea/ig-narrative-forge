import React from 'react';

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
  article?: {
    source_url: string;
    region?: string;
    published_at?: string | null;
  };
}

interface ExportableSlideRendererProps {
  story: Story;
  slideIndex: number;
  topicName: string;
}

/**
 * A simplified slide renderer optimized for export.
 * Uses inline styles to ensure consistent rendering during html2canvas capture.
 */
export const ExportableSlideRenderer: React.FC<ExportableSlideRendererProps> = ({ 
  story, 
  slideIndex, 
  topicName 
}) => {
  const currentSlide = story.slides[slideIndex];
  const isFirstSlide = slideIndex === 0;
  const isLastSlide = slideIndex === story.slides.length - 1;

  // Dynamic text sizing based on content length
  const getTextStyles = (content: string, isTitle: boolean): React.CSSProperties => {
    const length = content.length;
    if (isTitle) {
      const fontSize = length < 50 ? '72px' : length < 100 ? '60px' : '48px';
      return {
        fontSize,
        fontWeight: 700,
        textTransform: 'uppercase' as const,
        lineHeight: 1.2,
        letterSpacing: '-0.02em'
      };
    } else {
      const fontSize = length < 80 ? '48px' : length < 150 ? '40px' : length < 250 ? '32px' : '28px';
      return {
        fontSize,
        fontWeight: 300,
        lineHeight: 1.4
      };
    }
  };

  // Extract source domain
  const sourceDomain = story.article?.source_url && story.article.source_url !== '#' 
    ? (() => {
        try {
          return new URL(story.article.source_url).hostname.replace('www.', '');
        } catch {
          return null;
        }
      })()
    : null;

  const textStyles = getTextStyles(currentSlide.content, isFirstSlide);

  return (
    <div 
      className="exportable-slide-renderer"
      style={{ 
        width: '1080px', 
        height: '1080px',
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
        padding: '24px 32px',
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
        padding: '60px 80px',
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
        padding: '24px 32px',
        borderTop: '1px solid #e5e7eb',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span style={{ 
          fontSize: '18px',
          color: '#6b7280'
        }}>
          {story.author ? `By ${story.author}` : 'Source: Local News'}
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
