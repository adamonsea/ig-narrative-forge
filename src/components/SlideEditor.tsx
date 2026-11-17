import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { InlineError } from '@/components/ui/editorial';
import { WorkspaceDrawer } from '@/components/workspace/WorkspaceDrawer';
import { supabase } from '@/integrations/supabase/client';
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

const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;

export default function SlideEditor({ slideId, open, onClose }: SlideEditorProps) {
  const [slide, setSlide] = useState<Slide | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editedContent, setEditedContent] = useState('');

  const loadSlideData = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const { data, error } = await supabase.from('slides').select('*').eq('id', slideId).single();
      if (error) throw error;
      setSlide(data);
      setEditedContent(data.content || '');
    } catch (error) {
      console.error('Error loading slide data:', error);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && slideId) loadSlideData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideId, open]);

  const handleSave = async () => {
    if (!slide) return;
    setSaving(true);
    try {
      const wordCount = countWords(editedContent);
      const { error } = await supabase
        .from('slides')
        .update({ content: editedContent, word_count: wordCount, updated_at: new Date().toISOString() })
        .eq('id', slideId);
      if (error) throw error;
      setSlide({ ...slide, content: editedContent, word_count: wordCount });
      onClose();
    } catch (error) {
      console.error('Error saving slide:', error);
      toast.error("Couldn't save the slide");
    } finally {
      setSaving(false);
    }
  };

  const words = countWords(editedContent);
  const changed = slide ? editedContent !== (slide.content || '') : false;

  return (
    <WorkspaceDrawer
      open={open}
      onOpenChange={(o) => { if (!o) onClose(); }}
      title={slide ? `Slide ${slide.slide_number}` : 'Slide'}
      footer={slide && (
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !changed}>Save</Button>
        </>
      )}
    >
      {loading ? (
        <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-36 w-full" /></div>
      ) : failed || !slide ? (
        <InlineError message="Couldn't load this slide." actionLabel="Try again" onAction={loadSlideData} />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="slide-text" className="text-sm font-medium">Text</Label>
          <Textarea id="slide-text" value={editedContent} onChange={(e) => setEditedContent(e.target.value)} rows={8} className="resize-none text-base" />
          <p className="text-sm text-muted-foreground tabular-nums">{words} words</p>
        </div>
      )}
    </WorkspaceDrawer>
  );
}
