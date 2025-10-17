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
}

interface SimpleTextSlideRendererProps {
  story: Story;
  slideIndex: number;
  topicName: string;
}

export const SimpleTextSlideRenderer: React.FC<SimpleTextSlideRendererProps> = ({ 
  story, 
  slideIndex, 
  topicName 
}) => {
  const currentSlide = story.slides[slideIndex];
  const isFirstSlide = slideIndex === 0;

  // Dynamic text sizing based on content length - increased for better readability
  const getTextSize = (content: string, isTitle: boolean) => {
    const length = content.length;
    if (isTitle) {
      // Increased by one size point
      if (length < 50) return "text-6xl";
      if (length < 100) return "text-5xl";
      return "text-4xl";
    } else {
      // Increased by one size point
      if (length < 80) return "text-4xl";
      if (length < 150) return "text-3xl";
      if (length < 250) return "text-2xl";
      return "text-xl";
    }
  };

  return (
    <div 
      className="simple-text-slide-renderer"
      style={{ 
        width: '1080px', 
        height: '1080px',
        position: 'absolute',
        top: '0',
        left: '-100vw',
        zIndex: -1000,
        visibility: 'hidden',
        backgroundColor: '#ffffff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '80px'
      }}
    >
      <div 
        style={{
          width: '100%',
          textAlign: 'center',
          color: '#000000',
          lineHeight: '1.4'
        }}
        className={`${
          isFirstSlide 
            ? `${getTextSize(currentSlide.content, true)} font-bold uppercase` 
            : `${getTextSize(currentSlide.content, false)} font-light`
        }`}
      >
        {currentSlide.content}
      </div>
    </div>
  );
};