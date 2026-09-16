import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Compass, MapPin, Plus, X } from 'lucide-react';
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
  region?: string | null;
  landmarks?: string[] | null;
  postcodes?: string[] | null;
  organizations?: string[] | null;
  localityStrength?: number | null;
  nearbyPlaces?: unknown;
  bigStoryOverride?: boolean | null;
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

  const persist = useCallback(async (next: {
    locality_strength: number;
    nearby_places: NearbyPlace[];
    big_story_override: boolean;
  }) => {
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
      toast({
        title: 'Not saved',
        description: 'Your news settings could not be saved. Please try again.',
        variant: 'destructive',
      });
      return;
    }
    onChange?.(next);
  }, [topicId, toast, onChange]);

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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <Compass className="w-4 h-4" />
          News values
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* The dial */}
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <Label>How local?</Label>
            <span className="text-sm font-medium">{dial.label}</span>
          </div>
          <Slider
            value={[strength]}
            min={1}
            max={5}
            step={1}
            onValueChange={(v) => setStrength(v[0])}
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{LOCALITY_DIAL[1].label}</span>
            <span>{LOCALITY_DIAL[5].label}</span>
          </div>
          <p className="text-sm text-muted-foreground">{dial.blurb}</p>

          {preview && (
            <p className="text-xs text-muted-foreground border-t pt-3">
              Of your last {preview.total} arrivals, <strong className="text-foreground">{preview.published}</strong>{' '}
              would publish on their own and {preview.review} would wait for you.
              {' '}({preview.tiers.home} named your town, {preview.tiers.nearby + preview.tiers.far} a
              neighbouring place, {preview.tiers.nowhere} named nowhere.)
            </p>
          )}
        </div>

        {/* Neighbouring places */}
        <div className="space-y-3 border-t pt-4">
          <Label className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5" />
            Neighbouring places
          </Label>
          <p className="text-xs text-muted-foreground">
            Name the places next door. Tap one to switch it between near and further out —
            further out places need a bigger story to get in.
          </p>
          <div className="flex gap-2">
            <Input
              value={newPlace}
              placeholder="e.g. Hailsham"
              onChange={(e) => setNewPlace(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addPlace();
                }
              }}
            />
            <Button type="button" variant="outline" size="icon" onClick={addPlace} aria-label="Add place">
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          {places.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {places.map((p) => (
                <Badge
                  key={p.name}
                  variant={p.tier === 'near' ? 'default' : 'secondary'}
                  className="cursor-pointer gap-1.5"
                  onClick={() => togglePlace(p.name)}
                >
                  {p.name}
                  <span className="opacity-70">{p.tier === 'near' ? 'near' : 'further out'}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    onClick={(e) => { e.stopPropagation(); removePlace(p.name); }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Big story override */}
        <div className="flex items-start justify-between gap-4 border-t pt-4">
          <div className="space-y-1">
            <Label htmlFor="big-story-override">Let big stories through</Label>
            <p className="text-xs text-muted-foreground">
              A major incident, a large sum of money or one of your named organisations can carry a
              story in from further away.
            </p>
          </div>
          <Switch id="big-story-override" checked={override} onCheckedChange={setOverride} />
        </div>
      </CardContent>
    </Card>
  );
};
