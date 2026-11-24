import { SettingRow } from "@/components/settings/SettingRow";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { InfoHint } from '@/components/ui/editorial';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { MapPin, Plus, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import {
  applyNewsValues,
  detectPlaceTier,
  getDial,
  LOCALITY_DIAL,
  NearbyPlace,
  NewsValuesConfig,
  parseNearbyPlaces,
} from '@/lib/newsValues';

interface NewsValuesPanelProps {
  topicId: string;
  region?: string | null | undefined;
  landmarks?: string[] | null | undefined;
  postcodes?: string[] | null | undefined;
  organizations?: string[] | null | undefined;
  localityStrength?: number | null | undefined;
  nearbyPlaces?: unknown | undefined;
  bigStoryOverride?: boolean | null | undefined;
  onChange?: (values: { locality_strength: number; nearby_places: NearbyPlace[]; big_story_override: boolean }) => void;
}

interface SampleArticle {
  score: number;
  title: string;
  body: string;
}

export const NewsValuesPanel: React.FC<NewsValuesPanelProps> = ({
  topicId,
  region,
  landmarks,
  postcodes,
  organizations,
  localityStrength,
  nearbyPlaces,
  bigStoryOverride,
  onChange,
}) => {
  const { toast } = useToast();
  const [strength, setStrength] = useState<number>(localityStrength ?? 3);
  const [places, setPlaces] = useState<NearbyPlace[]>(parseNearbyPlaces(nearbyPlaces));
  const [override, setOverride] = useState<boolean>(bigStoryOverride !== false);
  const [newPlace, setNewPlace] = useState('');
  const [samples, setSamples] = useState<SampleArticle[]>([]);
  const saveTimer = useRef<number | null>(null);
  const firstRender = useRef(true);

  const config: NewsValuesConfig = useMemo(() => ({
    region,
    landmarks: landmarks || [],
    postcodes: postcodes || [],
    organizations: organizations || [],
    nearby_places: places,
    locality_strength: strength,
    big_story_override: override,
  }), [region, landmarks, postcodes, organizations, places, strength, override]);

  // Load a sample of recent arrivals so the owner can see the effect of the dial.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('topic_articles')
        .select('content_quality_score, shared_article_content(title, body)')
        .eq('topic_id', topicId)
        .order('created_at', { ascending: false })
        .limit(200);

      if (cancelled) return;
      const rows: SampleArticle[] = (data || []).map((row: any) => {
        const content = Array.isArray(row.shared_article_content)
          ? row.shared_article_content[0]
          : row.shared_article_content;
        return {
          score: typeof row.content_quality_score === 'number' ? row.content_quality_score : 0,
          title: content?.title || '',
          body: (content?.body || '').slice(0, 2500),
        };
      }).filter((r) => r.title);
      setSamples(rows);
    })();
    return () => { cancelled = true; };
  }, [topicId]);

  const preview = useMemo(() => {
    if (samples.length === 0) return null;
    let published = 0;
    let review = 0;
    const tiers = { home: 0, nearby: 0, far: 0, nowhere: 0 } as Record<string, number>;
    for (const s of samples) {
      const place = detectPlaceTier(s.title, s.body, config);
      tiers[place.tier] = (tiers[place.tier] || 0) + 1;
      const verdict = applyNewsValues(s.score, s.title, s.body, config, place);
      if (verdict.autoPublish) published++; else review++;
    }
    return { total: samples.length, published, review, tiers };
  }, [samples, config]);

  // Keep the latest onChange without making `persist` change identity,
  // which would otherwise retrigger the auto-save effect in a loop.
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const [saveState, setSaveState] = useState<SaveState>(null);
  const persist = useCallback(async (next: {
    locality_strength: number;
    nearby_places: NearbyPlace[];
    big_story_override: boolean;
  }) => {
    setSaveState('saving');
    const { error } = await supabase
      .from('topics')
      .update({
        locality_strength: next.locality_strength,
        nearby_places: next.nearby_places as any,
        big_story_override: next.big_story_override,
      })
      .eq('id', topicId);

    if (error) {
      console.error('Failed to save news values', error);
      setSaveState('not-saved');
      toast({
        title: 'Not saved',
        description: 'Your news settings could not be saved. Please try again.',
        variant: 'destructive',
      });
      return;
    }
    setSaveState('saved');
    onChangeRef.current?.(next);
  }, [topicId, toast]);

  // Auto-save, debounced.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      persist({ locality_strength: strength, nearby_places: places, big_story_override: override });
    }, 700);
    return () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
    };
  }, [strength, places, override, persist]);

  const addPlace = () => {
    const name = newPlace.trim();
    if (!name) return;
    if (places.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
      setNewPlace('');
      return;
    }
    setPlaces([...places, { name, tier: 'near' }]);
    setNewPlace('');
  };

  const togglePlace = (name: string) => {
    setPlaces(places.map((p) => (p.name === name ? { ...p, tier: p.tier === 'near' ? 'far' : 'near' } : p)));
  };

  const removePlace = (name: string) => setPlaces(places.filter((p) => p.name !== name));

  const dial = getDial(strength);

  return (
    <div className="divide-y divide-border border-y border-border">
      <SettingRow label="How local" hint={dial.blurb} stack>
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-base font-medium">{dial.label}</span>
            <SaveIndicator state={saveState} />
          </div>
          <Slider aria-label="How local" value={[strength]} min={1} max={5} step={1} onValueChange={(v) => setStrength(v[0]!)} />
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{LOCALITY_DIAL[1]!.label}</span>
            <span>{LOCALITY_DIAL[5]!.label}</span>
          </div>
          {preview && (
            <p className="text-sm text-muted-foreground">
              Of your last {preview.total} arrivals, <strong className="text-foreground">{preview.published}</strong> would publish on their own and {preview.review} would wait for you.
            </p>
          )}
        </div>
      </SettingRow>

      <SettingRow label="Neighbouring places" hint="Tap a place to switch near / further out. Further out needs a bigger story." stack>
        <div className="space-y-3">
          <div className="flex gap-2 sm:max-w-md">
            <Input aria-label="Add a place" className="h-11 text-base" value={newPlace} placeholder="e.g. Hailsham" onChange={(e) => setNewPlace(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPlace(); } }} />
            <Button type="button" variant="outline" size="icon" className="h-11 w-11" onClick={addPlace} aria-label="Add place" title="Add place"><Plus className="h-4 w-4" /></Button>
          </div>
          {places.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {places.map((p) => (
                <li key={p.name} className={`inline-flex items-center rounded-full border text-base ${p.tier === 'near' ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground'}`}>
                  <button type="button" onClick={() => togglePlace(p.name)} className="py-1.5 pl-3 pr-1">
                    {p.name} <span className="text-sm text-muted-foreground">· {p.tier === 'near' ? 'near' : 'further out'}</span>
                  </button>
                  <button type="button" aria-label={`Remove ${p.name}`} onClick={() => removePlace(p.name)} className="rounded-r-full p-2 hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SettingRow>

      <SettingRow label="Big stories" hint="A major incident, big money or a named organisation can carry a story in from further away.">
        <Switch id="big-story-override" aria-label="Big stories" checked={override} onCheckedChange={setOverride} />
      </SettingRow>
    </div>
  );
};
