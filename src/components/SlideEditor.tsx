import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Eye, ExternalLink, Download, Image as ImageIcon, Edit3, Save, X } from 'lucide-react';
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

interface SlideEditorProps {
  slideId: string;
  open: boolean;
  onClose: () => void;
}

export default function SlideEditor({ slideId, open, onClose }: SlideEditorProps) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [visuals, setVisuals] = useState<Visual[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedVisual, setSelectedVisual] = useState<Visual | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [editedVisualPrompt, setEditedVisualPrompt] = useState('');

  useEffect(() => {
    if (open && slideId) {
      loadSlideData();
    }
  }, [slideId, open]);

  const loadSlideData = async () => {
    try {
      setLoading(true);
      
      // Load slide info
      const { data: slideData, error: slideError } = await supabase
        .from('slides')
        .select('*, story_id')
        .eq('id', slideId)
        .single();

      if (slideError) throw slideError;
      setSlide(slideData);
      setEditedContent(slideData.content || '');
      setEditedVisualPrompt(slideData.visual_prompt || '');

      // Load carousel exports for this story (where the images actually are)
      const { data: exportData, error: exportError } = await supabase
        .from('carousel_exports')
        .select('*')
        .eq('story_id', slideData.story_id)
        .eq('status', 'completed')
        .order('created_at', { ascending: false })
        .limit(1);

      if (exportError) throw exportError;
      
      if (exportData && exportData.length > 0) {
        const exportRecord = exportData[0];
        const instagramPaths = exportRecord.export_formats?.['instagram-square']?.paths || [];
        
        // Convert storage paths to proper visual objects for compatibility
        const mockVisuals = instagramPaths.map((path: string, index: number) => ({
          id: `export-${index}`,
          image_url: path,
          alt_text: `Slide ${index + 1} carousel image`,
          style_preset: 'instagram-square',
          generation_prompt: `Carousel image for slide ${index + 1}`,
          created_at: exportRecord.created_at
        }));
        
        setVisuals(mockVisuals);
      } else {
        // Fallback to checking visuals table
        const { data: visualData, error: visualError } = await supabase
          .from('visuals')
          .select('*')
          .eq('slide_id', slideId)
          .order('created_at', { ascending: false });

        if (visualError) throw visualError;
        setVisuals(visualData || []);
      }
      
    } catch (error) {
      console.error('Error loading slide data:', error);
      toast.error('Failed to load slide data');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!slide) return;

    try {
      setSaving(true);

      const { error } = await supabase
        .from('slides')
        .update({
          content: editedContent,
          visual_prompt: editedVisualPrompt,
          word_count: editedContent.split(/\s+/).length,
          updated_at: new Date().toISOString()
        })
        .eq('id', slideId);

      if (error) throw error;

      setSlide({
        ...slide,
        content: editedContent,
        visual_prompt: editedVisualPrompt,
        word_count: editedContent.split(/\s+/).length
      });

      setIsEditing(false);
      toast.success('Slide updated successfully');

    } catch (error) {
      console.error('Error saving slide:', error);
      toast.error('Failed to save slide changes');
    } finally {
      setSaving(false);
    }
  };

  const downloadImage = (visual: Visual) => {
    if (visual.image_data) {
      const link = document.createElement('a');
      link.href = `data:image/jpeg;base64,${visual.image_data}`;
      link.download = `slide-${slide?.slide_number}-${visual.style_preset || 'image'}.jpg`;
      link.click();
    } else if (visual.image_url) {
      window.open(visual.image_url, '_blank');
    }
  };

  const getImageSrc = (visual: Visual) => {
    if (visual.image_data) {
      return `data:image/jpeg;base64,${visual.image_data}`;
    }
    if (visual.image_url) {
      if (visual.image_url.startsWith('carousels/')) {
        return `https://fpoywkjgdapgjtdeooak.supabase.co/storage/v1/object/public/exports/${visual.image_url}`;
      }
      return visual.image_url;
    }
    return '';
  };

  if (loading) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-center p-6">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!slide) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-4xl">
          <div className="p-6">
            <p className="text-muted-foreground">Slide not found</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ImageIcon className="h-5 w-5" />
            Slide {slide.slide_number} - Preview & Edit
          </DialogTitle>
          <DialogDescription>
            View and edit slide content, visual prompts, and generated images
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Slide Content */}
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base">Slide Content</CardTitle>
              <div className="flex gap-2">
                {isEditing ? (
                  <>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving...' : 'Save'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => {
                      setIsEditing(false);
                      setEditedContent(slide.content || '');
                      setEditedVisualPrompt(slide.visual_prompt || '');
                    }}>
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => setIsEditing(true)}>
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {isEditing ? (
                <>
                  <div>
                    <label className="text-sm font-medium">Content</label>
                    <Textarea
                      value={editedContent}
                      onChange={(e) => setEditedContent(e.target.value)}
                      rows={4}
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Word count: {editedContent.split(/\s+/).length}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Visual Prompt</label>
                    <Textarea
                      value={editedVisualPrompt}
                      onChange={(e) => setEditedVisualPrompt(e.target.value)}
                      rows={2}
                      placeholder="Describe the visual for this slide..."
                      className="mt-1"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <p className="text-sm leading-relaxed">{slide.content}</p>
                    <Badge variant="outline" className="mt-2">
                      {slide.word_count} words
                    </Badge>
                  </div>
                  {slide.visual_prompt && (
                    <div className="bg-muted/50 p-3 rounded-lg">
                      <p className="text-sm font-medium mb-1">Visual Prompt:</p>
                      <p className="text-sm text-muted-foreground">{slide.visual_prompt}</p>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Generated Visuals */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Generated Visuals</CardTitle>
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
                            className="w-full h-full object-cover cursor-pointer"
                            onClick={() => setSelectedVisual(visual)}
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
                        <Button 
                          size="sm" 
                          variant="secondary"
                          onClick={() => setSelectedVisual(visual)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        
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
            </CardContent>
          </Card>
        </div>

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
      </DialogContent>
    </Dialog>
  );
}