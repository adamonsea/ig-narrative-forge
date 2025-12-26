import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { exportCarouselSlides } from '@/lib/carouselExporter';

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

interface ExportState {
  isExporting: boolean;
  progress: number;
  message: string;
  storyId: string | null;
}

export const useCarouselExport = () => {
  const [exportState, setExportState] = useState<ExportState>({
    isExporting: false,
    progress: 0,
    message: '',
    storyId: null
  });
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const exportStory = useCallback(async (
    story: Story,
    SlideRenderer: React.FC<{ story: Story; slideIndex: number; topicName: string }>,
    topicName: string = 'News'
  ) => {
    if (exportState.isExporting) return;

    setExportState({
      isExporting: true,
      progress: 0,
      message: 'Starting export...',
      storyId: story.id
    });

    // Create a container for rendering slides
    const container = document.createElement('div');
    container.id = `carousel-export-container-${story.id}`;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.width = '1080px';
    container.style.height = '1080px';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);
    containerRef.current = container;

    try {
      // Import ReactDOM dynamically to render slides
      const { createRoot } = await import('react-dom/client');
      const React = await import('react');

      const renderSlide = (slideIndex: number): HTMLElement | null => {
        // Create a wrapper div for this slide
        const slideWrapper = document.createElement('div');
        slideWrapper.style.width = '1080px';
        slideWrapper.style.height = '1080px';
        slideWrapper.style.position = 'absolute';
        slideWrapper.style.left = '0';
        slideWrapper.style.top = '0';
        slideWrapper.style.visibility = 'visible';
        slideWrapper.style.backgroundColor = '#ffffff';
        container.innerHTML = ''; // Clear previous
        container.appendChild(slideWrapper);

        // Render the slide component
        const root = createRoot(slideWrapper);
        root.render(
          React.createElement(SlideRenderer, {
            story,
            slideIndex,
            topicName
          })
        );

        // Force synchronous layout
        slideWrapper.getBoundingClientRect();

        // Find the actual rendered content
        const renderedSlide = slideWrapper.querySelector('.carousel-slide-renderer, .simple-text-slide-renderer') as HTMLElement;
        
        if (renderedSlide) {
          // Make it visible for capture
          renderedSlide.style.visibility = 'visible';
          renderedSlide.style.position = 'relative';
          renderedSlide.style.left = '0';
          renderedSlide.style.top = '0';
          renderedSlide.style.zIndex = 'auto';
          return renderedSlide;
        }

        // Fallback to the wrapper itself
        return slideWrapper;
      };

      await exportCarouselSlides(
        renderSlide,
        story.slides.length,
        story.title,
        (progress) => {
          setExportState(prev => ({
            ...prev,
            progress: Math.round((progress.current / progress.total) * 100),
            message: progress.message
          }));

          if (progress.status === 'complete') {
            toast({
              title: 'Carousel Exported!',
              description: `${progress.total} slides ready for social media.`,
            });
          } else if (progress.status === 'error') {
            toast({
              title: 'Export Failed',
              description: progress.message,
              variant: 'destructive',
            });
          }
        }
      );

    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      // Cleanup
      if (containerRef.current && document.body.contains(containerRef.current)) {
        document.body.removeChild(containerRef.current);
      }
      containerRef.current = null;
      
      setExportState({
        isExporting: false,
        progress: 0,
        message: '',
        storyId: null
      });
    }
  }, [exportState.isExporting, toast]);

  return {
    exportStory,
    isExporting: exportState.isExporting,
    exportingStoryId: exportState.storyId,
    progress: exportState.progress,
    message: exportState.message
  };
};
