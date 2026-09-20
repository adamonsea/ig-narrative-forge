import { useState, useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { exportCarouselSlides } from '@/lib/carouselExporter';
import { SLIDE_DIMENSIONS, type SlideAspect } from '@/components/ExportableSlideRenderer';
import { getPublicationLabel } from '@/lib/storyAttribution';

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

interface ExportState {
  isExporting: boolean;
  progress: number;
  message: string;
  storyId: string | null;
}

interface ExportOptions {
  storyUrl?: string | null;
}

const buildCaption = (story: Story, topicName: string, storyUrl?: string | null): string => {
  const publication = getPublicationLabel(story.publication_name, story.article?.source_url);
  const summary = story.slides[1]?.content || story.slides[0]?.content || '';
  const lines = [story.title, '', summary];

  if (publication) {
    lines.push('', `Reported by ${publication}`);
  }
  if (story.article?.source_url && story.article.source_url !== '#') {
    lines.push(`Original article: ${story.article.source_url}`);
  }
  if (storyUrl) {
    lines.push(`Read on ${topicName}: ${storyUrl}`);
  }

  return lines.join('\n').trim() + '\n';
};

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
    SlideRenderer: React.FC<{ story: Story; slideIndex: number; topicName: string; aspect?: SlideAspect }>,
    topicName: string = 'News',
    options: ExportOptions = {}
  ) => {
    if (exportState.isExporting) return;

    setExportState({
      isExporting: true,
      progress: 0,
      message: 'Starting export...',
      storyId: story.id
    });

    // Offscreen container for rendering slides
    const container = document.createElement('div');
    container.id = `carousel-export-container-${story.id}`;
    container.style.position = 'absolute';
    container.style.left = '-9999px';
    container.style.top = '0';
    container.style.overflow = 'hidden';
    document.body.appendChild(container);
    containerRef.current = container;

    const { createRoot } = await import('react-dom/client');
    const React = await import('react');

    const slideWrapper = document.createElement('div');
    slideWrapper.style.position = 'absolute';
    slideWrapper.style.left = '0';
    slideWrapper.style.top = '0';
    slideWrapper.style.backgroundColor = '#ffffff';
    container.appendChild(slideWrapper);
    const root = createRoot(slideWrapper);

    const renderSlide = (slideIndex: number, aspect: SlideAspect): HTMLElement | null => {
      const { width, height } = SLIDE_DIMENSIONS[aspect];
      slideWrapper.style.width = `${width}px`;
      slideWrapper.style.height = `${height}px`;

      root.render(
        React.createElement(SlideRenderer, {
          story,
          slideIndex,
          topicName,
          aspect
        })
      );

      return slideWrapper;
    };

    try {
      await exportCarouselSlides(
        async (slideIndex: number, aspect: SlideAspect) => renderSlide(slideIndex, aspect),
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
              title: 'Social pack ready',
              description: `${story.slides.length} slides in square and 9:16, plus a caption.`,
            });
          } else if (progress.status === 'error') {
            toast({
              title: 'Export Failed',
              description: progress.message,
              variant: 'destructive',
            });
          }
        },
        buildCaption(story, topicName, options.storyUrl)
      );

    } catch (error) {
      console.error('Export failed:', error);
      toast({
        title: 'Export Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive',
      });
    } finally {
      // Cleanup: unmount the React root, then remove the container
      try {
        root.unmount();
      } catch {
        // ignore
      }
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
