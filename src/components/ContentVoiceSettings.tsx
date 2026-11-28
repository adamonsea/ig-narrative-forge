import { StoryLengthSelect } from "@/components/settings/StoryLengthSelect";
import { useAuth } from "@/hooks/useAuth";
import { RememberedFold, openFold } from "@/components/settings/RememberedFold";
import type { FeedStoryLength } from "@/lib/storyLength";
import { SettingRow } from "@/components/settings/SettingRow";
import { SaveIndicator } from "@/components/ui/editorial";
import { useState, useEffect, useCallback, useMemo } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pencil, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { getHouseStylePresets, matchPreset, CUSTOM_HOUSE_STYLE } from "@/lib/houseStylePresets";

interface ContentVoiceSettingsProps {
  topicId: string;
  topicName?: string | undefined;
  topicType?: 'regional' | 'keyword' | string | undefined;
  region?: string | null | undefined;
  currentStoryLength?: FeedStoryLength | string | undefined;
  currentExpertise?: 'beginner' | 'intermediate' | 'expert' | undefined;
  currentTone?: 'formal' | 'conversational' | 'engaging' | 'satirical' | 'rhyming_couplet' | undefined;
  currentWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven' | undefined;
  currentHouseStyleNotes?: string | null | undefined;
  currentHouseStyleExamples?: string | null | undefined;
  onUpdate?: () => void;
}

const splitExamples = (value?: string | null): string[] =>
  (value || '')
    .split(/\n{1,}/)
    .map((line) => line.trim())
    .filter(Boolean);

export const ContentVoiceSettings = ({
  topicId,
  topicName,
  topicType,
  region,
  currentStoryLength,
  currentExpertise,
  currentTone,
  currentWritingStyle,
  currentHouseStyleNotes,
  currentHouseStyleExamples,
  onUpdate
}: ContentVoiceSettingsProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  useEffect(() => {
    const reveal = () => {
      if (['audience', 'tone', 'writing-style', 'example-sentences', 'longer-stories'].includes(window.location.hash.slice(1))) {
        openFold(user?.id, `writing-advanced-${topicId}`);
      }
    };
    reveal();
    window.addEventListener('hashchange', reveal);
    return () => window.removeEventListener('hashchange', reveal);
  }, [topicId, user?.id]);
  const [storyLength, setStoryLength] = useState(currentStoryLength ?? 'standard');
  useEffect(() => { setStoryLength(currentStoryLength ?? 'standard'); }, [currentStoryLength, topicId]);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved');
  const [houseStyleNotes, setHouseStyleNotes] = useState(currentHouseStyleNotes ?? '');
  const presets = useMemo(
    () => getHouseStylePresets({ name: topicName, topicType, region }),
    [topicName, topicType, region]
  );
  const [presetChoice, setPresetChoice] = useState(() => matchPreset(presets, currentHouseStyleNotes));

  const [examples, setExamples] = useState<string[]>(() => splitExamples(currentHouseStyleExamples));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setHouseStyleNotes(currentHouseStyleNotes ?? '');
    setPresetChoice(matchPreset(presets, currentHouseStyleNotes));
  }, [currentHouseStyleNotes, presets]);

  useEffect(() => {
    setExamples(splitExamples(currentHouseStyleExamples));
  }, [currentHouseStyleExamples]);

  const autoSave = useCallback(async (field: string, value: string) => {
    setSaveState('saving');
    try {
      const { error } = await supabase
        .from('topics')
        .update({ [field]: value, updated_at: new Date().toISOString() } as any)
        .eq('id', topicId).select('id').single();

      if (error) throw error;
      setSaveState('saved');
      onUpdate?.();
    } catch (error) {
      console.error('Error updating setting:', error);
      if (field === 'story_length') setStoryLength(currentStoryLength ?? 'standard');
      setSaveState('error');
      toast({ title: "Error", description: "Failed to save", variant: "destructive" });
    }
  }, [topicId, onUpdate, toast, currentStoryLength]);

  const saveExamples = (next: string[]) => {
    setExamples(next);
    autoSave('house_style_examples', next.join('\n'));
  };

  const commitDraft = () => {
    const value = draft.trim();
    if (!value) {
      setEditingIndex(null);
      setAdding(false);
      setDraft('');
      return;
    }
    const next = [...examples];
    if (editingIndex !== null) next[editingIndex] = value;
    else next.push(value);
    saveExamples(next);
    setEditingIndex(null);
    setAdding(false);
    setDraft('');
  };

  return (
    <div className="divide-y divide-border border-y border-border">
        <SettingRow label="Story length" hint="For new stories. Existing stories stay unchanged." className="flex-col gap-4 sm:flex-row">
          <SaveIndicator state={saveState === 'saving' ? 'saving' : saveState === 'error' ? 'not-saved' : 'saved'} />
          <StoryLengthSelect value={storyLength} onChange={(value) => { setStoryLength(value); void autoSave('story_length', value); }} />
        </SettingRow>
        <SettingRow label="House style" hint="How this feed sounds." stack>
          <div className="space-y-3">
          <Select
            value={presetChoice || undefined}
            onValueChange={(v) => {
              setPresetChoice(v);
              if (v === CUSTOM_HOUSE_STYLE) return;
              const preset = presets.find((p) => p.id === v);
              if (preset) {
                setHouseStyleNotes(preset.text);
                autoSave('house_style_notes', preset.text);
              }
            }}
          >
            <SelectTrigger id="house-style-preset" aria-label="House style" className="h-11 text-base sm:w-80">
              <SelectValue placeholder="Choose a house style" />
            </SelectTrigger>
            <SelectContent>
              {presets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>{preset.label}</SelectItem>
              ))}
              <SelectItem value={CUSTOM_HOUSE_STYLE}>Your own description…</SelectItem>
            </SelectContent>
          </Select>

        {presetChoice && (
          <div className="space-y-2">
            {presetChoice === CUSTOM_HOUSE_STYLE ? (
              <Textarea
                id="house-style-notes"
                rows={3}
                autoFocus
                placeholder="How should this feed sound? e.g. Plain, dry, local. Short sentences. Name the street. No cheerleading."
                value={houseStyleNotes}
                onChange={(e) => setHouseStyleNotes(e.target.value)}
                onBlur={() => {
                  if ((currentHouseStyleNotes ?? '') !== houseStyleNotes) {
                    autoSave('house_style_notes', houseStyleNotes);
                  }
                }}
              />
            ) : (
              <p className="rounded-lg bg-muted/40 p-3 text-base text-muted-foreground">{houseStyleNotes}</p>
            )}
          </div>
        )}
          </div>
        </SettingRow>

        <RememberedFold foldKey={`writing-advanced-${topicId}`} label="Advanced" className="py-4">
          <div className="divide-y divide-border">
        <SettingRow label="Longer stories" hint="Extended allows up to 12 slides." className="flex-col gap-4 sm:flex-row">
          <StoryLengthSelect extended value={storyLength} onChange={(value) => { setStoryLength(value); void autoSave('story_length', value); }} />
        </SettingRow>
        <SettingRow label="Audience" hint="How much readers already know." className="flex-col gap-4 sm:flex-row">
          <Select
            value={currentExpertise || 'intermediate'}
            onValueChange={(v) => autoSave('audience_expertise', v)}
          >
            <SelectTrigger className="h-11 w-48 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="expert">Expert</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Tone" hint="How stories sound." className="flex-col gap-4 sm:flex-row">
          <Select
            value={currentTone || 'conversational'}
            onValueChange={(v) => autoSave('default_tone', v)}
          >
            <SelectTrigger className="h-11 w-48 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="conversational">Conversational</SelectItem>
              <SelectItem value="engaging">Engaging</SelectItem>
              <SelectItem value="satirical">Satirical</SelectItem>
              <SelectItem value="rhyming_couplet">Rhyming couplet</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Writing style" hint="How stories are shaped." className="flex-col gap-4 sm:flex-row">
          <Select
            value={currentWritingStyle || 'journalistic'}
            onValueChange={(v) => autoSave('default_writing_style', v)}
          >
            <SelectTrigger className="h-11 w-48 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="journalistic">Journalistic</SelectItem>
              <SelectItem value="educational">Educational</SelectItem>
              <SelectItem value="listicle">Listicle</SelectItem>
              <SelectItem value="story_driven">Story-driven</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow label="Example sentences" hint="Sentences you'd publish. Their rhythm is copied, not their content." stack>

          <div className="space-y-2">
            {examples.map((example, index) =>
              editingIndex === index ? (
                <div key={index} className="space-y-2 rounded-lg border p-3">
                  <Textarea rows={3} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={commitDraft}>Save</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setEditingIndex(null); setDraft(''); }}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div key={index} className="group flex items-start gap-3 rounded-lg border p-3">
                  <p className="flex-1 text-base leading-relaxed">{example}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7"
                      aria-label="Edit example sentence" title="Edit"
                      onClick={() => { setAdding(false); setEditingIndex(index); setDraft(example); }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      aria-label="Delete example sentence" title="Delete"
                      onClick={() => saveExamples(examples.filter((_, i) => i !== index))}
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            )}

            {adding ? (
              <div className="space-y-2 rounded-lg border p-3">
                <Textarea
                  rows={3}
                  autoFocus
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Paste a sentence you'd be happy to publish…"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={commitDraft}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAdding(false); setDraft(''); }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setEditingIndex(null); setDraft(''); setAdding(true); }}
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Sentence
              </Button>
            )}
          </div>
        </SettingRow>
          </div>
        </RememberedFold>
    </div>
  );
};
