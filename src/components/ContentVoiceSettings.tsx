import { useState, useEffect, useCallback } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ILLUSTRATION_STYLES, ILLUSTRATION_STYLE_LABELS, type IllustrationStyle } from "@/lib/constants/illustrationStyles";

interface ContentVoiceSettingsProps {
  topicId: string;
  currentExpertise?: 'beginner' | 'intermediate' | 'expert';
  currentTone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet';
  currentWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  currentIllustrationStyle?: IllustrationStyle;
  currentHouseStyleNotes?: string | null;
  currentHouseStyleExamples?: string | null;
  onUpdate?: () => void;
}

export const ContentVoiceSettings = ({
  topicId,
  currentExpertise,
  currentTone,
  currentWritingStyle,
  currentIllustrationStyle,
  currentHouseStyleNotes,
  currentHouseStyleExamples,
  onUpdate
}: ContentVoiceSettingsProps) => {
  const { toast } = useToast();
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [houseStyleNotes, setHouseStyleNotes] = useState(currentHouseStyleNotes ?? '');
  const [houseStyleExamples, setHouseStyleExamples] = useState(currentHouseStyleExamples ?? '');

  useEffect(() => {
    setHouseStyleNotes(currentHouseStyleNotes ?? '');
  }, [currentHouseStyleNotes]);

  useEffect(() => {
    setHouseStyleExamples(currentHouseStyleExamples ?? '');
  }, [currentHouseStyleExamples]);

  const autoSave = useCallback(async (field: string, value: string) => {
    setSaveState('saving');
    try {
      const { error } = await supabase
        .from('topics')
        .update({ [field]: value, updated_at: new Date().toISOString() } as any)
        .eq('id', topicId);

      if (error) throw error;
      setSaveState('saved');
      onUpdate?.();
    } catch (error) {
      console.error('Error updating setting:', error);
      setSaveState('error');
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  }, [topicId, onUpdate, toast]);

  return (
    <div className="space-y-5">
      <div className="flex justify-end text-xs text-muted-foreground" aria-live="polite">
        {saveState === 'saving' ? 'Saving' : saveState === 'error' ? 'Not saved' : 'Saved'}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Audience Expertise</Label>
        <Select
          value={currentExpertise || 'intermediate'}
          onValueChange={(v) => autoSave('audience_expertise', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="expert">Expert</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Content Tone</Label>
        <Select
          value={currentTone || 'conversational'}
          onValueChange={(v) => autoSave('default_tone', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="formal">Formal</SelectItem>
            <SelectItem value="conversational">Conversational</SelectItem>
            <SelectItem value="engaging">Engaging</SelectItem>
            <SelectItem value="satirical">Satirical</SelectItem>
            <SelectItem value="rhyming_couplet">Rhyming Couplet</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Writing Style</Label>
        <Select
          value={currentWritingStyle || 'journalistic'}
          onValueChange={(v) => autoSave('default_writing_style', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="journalistic">Journalistic</SelectItem>
            <SelectItem value="educational">Educational</SelectItem>
            <SelectItem value="listicle">Listicle</SelectItem>
            <SelectItem value="story_driven">Story-driven</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Visual Style</Label>
        <Select
          value={currentIllustrationStyle || ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE}
          onValueChange={(v) => autoSave('illustration_style', v)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE}>
              {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE]}
            </SelectItem>
            <SelectItem value={ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC}>
              {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC]}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="house-style-notes">House style</Label>
        <Textarea
          id="house-style-notes"
          rows={4}
          placeholder="How should this feed sound? e.g. Plain, dry, local. Short sentences. Name the street. No cheerleading."
          value={houseStyleNotes}
          onChange={(e) => setHouseStyleNotes(e.target.value)}
          onBlur={() => {
            if ((currentHouseStyleNotes ?? '') !== houseStyleNotes) {
              autoSave('house_style_notes', houseStyleNotes);
            }
          }}
        />
        <p className="text-xs text-muted-foreground">
          Applied to every story in this feed, including automated ones.
        </p>
      </div>

      <div className="space-y-1.5 sm:col-span-2">
        <Label htmlFor="house-style-examples">Example sentences</Label>
        <Textarea
          id="house-style-examples"
          rows={3}
          placeholder="Paste one or two sentences you'd be happy to publish. Their rhythm will be copied, not their content."
          value={houseStyleExamples}
          onChange={(e) => setHouseStyleExamples(e.target.value)}
          onBlur={() => {
            if ((currentHouseStyleExamples ?? '') !== houseStyleExamples) {
              autoSave('house_style_examples', houseStyleExamples);
            }
          }}
        />
      </div>
      </div>
    </div>
  );
};
