import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Eye, ExternalLink, Download, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

interface Visual {
  id: string;
  image_url?: string;
  image_data?: string;
  alt_text?: string;
  style_preset?: string;
  generation_prompt?: string;
  created_at: string;
}

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  visual_prompt?: string;
  word_count: number;
}

interface SlideViewerProps {
  slideId: string;
}

export default function SlideViewer({ slideId }: SlideViewerProps) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVisual, setSelectedVisual] = useState<Visual | null>(null);

  useEffect(() => {
    loadSlideData();
  }, [slideId]);

  const loadSlideData = async () => {
    try {
      setLoading(true);
      
      // Load slide info
      const { data: slideData, error: slideError } = await supabase
        .from('slides')
        .select('*')
        .eq('id', slideId)
        .single();

      if (slideError) throw slideError;
      setSlide(slideData);

      // Load visuals for this slide
      const { data: visualData, error: visualError } = await supabase
        .from('visuals')
        .select('*')
        .eq('slide_id', slideId)
        .order('created_at', { ascending: false });

      if (visualError) throw visualError;
      setVisuals(visualData || []);
      
    } catch (error) {
      console.error('Error loading slide data:', error);
      toast.error('Failed to load slide data');
    } finally {
      setLoading(false);
    }
  };

  const downloadImage = (visual: Visual) => {
    if (visual.image_data) {
      // Download base64 image
      const link = document.createElement('a');
      link.href = `data:image/jpeg;base64,${visual.image_data}`;
      link.download = `slide-${slide?.slide_number}-${visual.style_preset || 'image'}.jpg`;
      link.click();
    } else if (visual.image_url) {
      // Open image URL in new tab
      window.open(visual.image_url, '_blank');
    }
  };

  const getImageSrc = (visual: Visual) => {
    if (visual.image_data) {
      return `data:image/jpeg;base64,${visual.image_data}`;
    }
    return visual.image_url || '';
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!slide) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-muted-foreground">Slide not found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          Slide {slide.slide_number} - Generated Visuals
        </CardTitle>
        <CardDescription>
          {slide.content.substring(0, 100)}...
        </CardDescription>
      </CardHeader>
      <CardContent>
        {visuals.length === 0 ? (
          <div className="text-center py-8">
            <ImageIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">No visuals generated for this slide yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {visuals.map((visual) => (
              <div key={visual.id} className="relative group">
                <div className="aspect-square bg-muted rounded-lg overflow-hidden">
                  {getImageSrc(visual) ? (
                    <img
                      src={getImageSrc(visual)}
                      alt={visual.alt_text || 'Generated visual'}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <ImageIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                </div>
                
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2">
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button 
                        size="sm" 
                        variant="secondary"
                        onClick={() => setSelectedVisual(visual)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={() => downloadImage(visual)}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  
                  {visual.image_url && (
                    <Button 
                      size="sm" 
                      variant="secondary"
                      onClick={() => window.open(visual.image_url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div className="mt-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {visual.style_preset || 'default'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(visual.created_at).toLocaleDateString()}
                    </span>
                  </div>
                  {visual.alt_text && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                      {visual.alt_text}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Full size image dialog */}
        {selectedVisual && (
          <Dialog open={!!selectedVisual} onOpenChange={() => setSelectedVisual(null)}>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Generated Visual</DialogTitle>
                <DialogDescription>
                  Slide {slide.slide_number} • {selectedVisual.style_preset || 'Default'} style
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={getImageSrc(selectedVisual)}
                    alt={selectedVisual.alt_text || 'Generated visual'}
                    className="w-full max-h-96 object-contain rounded-lg"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="font-medium">Alt Text:</p>
                    <p className="text-muted-foreground">
                      {selectedVisual.alt_text || 'No alt text'}
                    </p>
                  </div>
                  <div>
                    <p className="font-medium">Style Preset:</p>
                    <p className="text-muted-foreground">
                      {selectedVisual.style_preset || 'Default'}
                    </p>
                  </div>
                </div>
                
                {selectedVisual.generation_prompt && (
                  <div>
                    <p className="font-medium text-sm">Generation Prompt:</p>
                    <p className="text-xs text-muted-foreground bg-muted p-2 rounded">
                      {selectedVisual.generation_prompt}
                    </p>
                  </div>
                )}

                <div className="flex gap-2">
                  <Button onClick={() => downloadImage(selectedVisual)}>
                    <Download className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                  {selectedVisual.image_url && (
                    <Button 
                      variant="outline"
                      onClick={() => window.open(selectedVisual.image_url, '_blank')}
                    >
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in New Tab
                    </Button>
                  )}
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}