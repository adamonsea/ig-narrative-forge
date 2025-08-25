import React, { useRef, useEffect, useState } from 'react';
import html2canvas from 'html2canvas';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  word_count: number;
}

interface Story {
  id: string;
  title: string;
  slides: Slide[];
  author?: string;
}

interface CarouselImageGeneratorProps {
  story: Story;
  format: 'instagram-square' | 'instagram-story';
  onGenerated?: (images: string[]) => void;
}

export const CarouselImageGenerator: React.FC<CarouselImageGeneratorProps> = ({
  story,
  format,
  onGenerated
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [generating, setGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const { toast } = useToast();

  const formatConfig = {
    'instagram-square': { width: 1080, height: 1080, aspectRatio: '1:1' },
    'instagram-story': { width: 1080, height: 1920, aspectRatio: '9:16' }
  };

  const config = formatConfig[format];

  const generateImages = async () => {
    if (!containerRef.current) return;

    setGenerating(true);
    const images: string[] = [];

    try {
      for (const slide of story.slides) {
        // Create a temporary slide element for rendering
        const slideElement = createSlideElement(slide, story);
        containerRef.current.appendChild(slideElement);

        // Wait for fonts and content to load
        await new Promise(resolve => setTimeout(resolve, 100));

        // Generate image
        const canvas = await html2canvas(slideElement, {
          width: config.width,
          height: config.height,
          scale: 2, // For retina quality
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: false
        });

        const imageData = canvas.toDataURL('image/png', 1.0);
        images.push(imageData);

        // Clean up
        containerRef.current.removeChild(slideElement);
      }

      setGeneratedImages(images);
      onGenerated?.(images);

      toast({
        title: "Carousel Generated",
        description: `Successfully generated ${images.length} ${format} images`,
      });

    } catch (error: any) {
      console.error('Error generating carousel images:', error);
      toast({
        title: "Generation Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
    }
  };

  const createSlideElement = (slide: Slide, story: Story): HTMLDivElement => {
    const element = document.createElement('div');
    element.style.width = `${config.width}px`;
    element.style.height = `${config.height}px`;
    element.style.position = 'absolute';
    element.style.left = '-9999px';
    element.style.backgroundColor = '#ffffff';
    element.style.display = 'flex';
    element.style.flexDirection = 'column';
    element.style.justifyContent = 'center';
    element.style.alignItems = 'center';
    element.style.padding = '60px';
    element.style.boxSizing = 'border-box';
    element.style.fontFamily = 'Lexend, system-ui, sans-serif';

    // Add slide content
    const content = document.createElement('div');
    content.style.textAlign = 'center';
    content.style.maxWidth = '100%';
    content.style.wordWrap = 'break-word';

    // Slide number indicator
    const slideNumber = document.createElement('div');
    slideNumber.textContent = `${slide.slide_number}/${story.slides.length}`;
    slideNumber.style.position = 'absolute';
    slideNumber.style.top = '30px';
    slideNumber.style.right = '30px';
    slideNumber.style.fontSize = '16px';
    slideNumber.style.color = '#666666';
    slideNumber.style.fontWeight = '500';

    // Main content
    const mainText = document.createElement('h1');
    mainText.textContent = slide.content;
    mainText.style.fontSize = format === 'instagram-story' ? '42px' : '36px';
    mainText.style.lineHeight = '1.2';
    mainText.style.color = '#1a1a1a';
    mainText.style.fontWeight = '600';
    mainText.style.margin = '0';

    // Story title (smaller, at bottom)
    const storyTitle = document.createElement('div');
    storyTitle.textContent = story.title;
    storyTitle.style.position = 'absolute';
    storyTitle.style.bottom = '60px';
    storyTitle.style.left = '60px';
    storyTitle.style.right = '60px';
    storyTitle.style.fontSize = '18px';
    storyTitle.style.color = '#666666';
    storyTitle.style.textAlign = 'center';
    storyTitle.style.fontWeight = '400';

    // Author attribution
    if (story.author) {
      const author = document.createElement('div');
      author.textContent = `By ${story.author}`;
      author.style.position = 'absolute';
      author.style.bottom = '30px';
      author.style.left = '60px';
      author.style.right = '60px';
      author.style.fontSize = '14px';
      author.style.color = '#999999';
      author.style.textAlign = 'center';
      element.appendChild(author);
    }

    content.appendChild(mainText);
    element.appendChild(slideNumber);
    element.appendChild(content);
    element.appendChild(storyTitle);

    return element;
  };

  const downloadImage = (imageData: string, slideNumber: number) => {
    const link = document.createElement('a');
    link.download = `${story.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_slide_${slideNumber}_${format}.png`;
    link.href = imageData;
    link.click();
  };

  const downloadAll = () => {
    generatedImages.forEach((imageData, index) => {
      setTimeout(() => {
        downloadImage(imageData, index + 1);
      }, index * 100); // Stagger downloads
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">
            Carousel Generator ({config.aspectRatio})
          </h3>
          <p className="text-sm text-muted-foreground">
            Generate {story.slides.length} images for {format.replace('-', ' ')}
          </p>
        </div>
        <Button 
          onClick={generateImages} 
          disabled={generating}
          size="sm"
        >
          {generating ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {generating ? 'Generating...' : 'Generate Images'}
        </Button>
      </div>

      {generatedImages.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Badge variant="default">{generatedImages.length} Images Ready</Badge>
                <span className="text-sm text-muted-foreground">
                  {config.width}×{config.height}px
                </span>
              </div>
              <Button onClick={downloadAll} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download All
              </Button>
            </div>
            
            <div className="grid grid-cols-4 gap-2">
              {generatedImages.map((imageData, index) => (
                <div key={index} className="relative group">
                  <img 
                    src={imageData} 
                    alt={`Slide ${index + 1}`}
                    className="w-full h-auto rounded border cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => downloadImage(imageData, index + 1)}
                  />
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-20 transition-all flex items-center justify-center rounded">
                    <Download className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hidden container for rendering */}
      <div ref={containerRef} style={{ position: 'absolute', left: '-9999px' }} />
    </div>
  );
};