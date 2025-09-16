import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { Edit3, Save, X } from 'lucide-react';
import { toast } from 'sonner';

interface Slide {
  id: string;
  slide_number: number;
  content: string;
  word_count: number;
}

interface SlideEditorProps {
  slideId: string;
  open: boolean;
  onClose: () => void;
}

export default function SlideEditor({ slideId, open, onClose }: SlideEditorProps) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');

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
        .select('*')
        .eq('id', slideId)
        .single();

      if (slideError) throw slideError;
      setSlide(slideData);
      setEditedContent(slideData.content || '');
      
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
      
      const wordCount = editedContent.trim().split(/\s+/).filter(word => word.length > 0).length;

      const { error } = await supabase
        .from('slides')
        .update({
          content: editedContent,
          word_count: wordCount,
          updated_at: new Date().toISOString()
        })
        .eq('id', slideId);

      if (error) throw error;

      setSlide({
        ...slide,
        content: editedContent,
        word_count: wordCount
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

  // Calculate live word count
  const liveWordCount = editedContent.trim().split(/\s+/).filter(word => word.length > 0).length;

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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Edit Slide {slide.slide_number}
          </DialogTitle>
          <DialogDescription>
            Edit the slide content and save your changes
          </DialogDescription>
        </DialogHeader>
        
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
              <div>
                <label className="text-sm font-medium mb-2 block">Content</label>
                <Textarea
                  value={editedContent}
                  onChange={(e) => setEditedContent(e.target.value)}
                  rows={6}
                  className="resize-none"
                  placeholder="Enter slide content..."
                />
                <div className="flex justify-between items-center mt-2">
                  <p className="text-xs text-muted-foreground">
                    Live word count: {liveWordCount}
                  </p>
                  <Badge variant={liveWordCount < 50 ? "destructive" : liveWordCount > 150 ? "secondary" : "default"}>
                    {liveWordCount < 50 ? "Too short" : liveWordCount > 150 ? "Long" : "Good length"}
                  </Badge>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{slide.content}</p>
                <div className="flex items-center gap-2 mt-4">
                  <Badge variant="outline">
                    {slide.word_count} words
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}