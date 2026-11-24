import { SettingRow } from "@/components/settings/SettingRow";
import { useCallback, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, MapPin, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InfoHint } from "@/components/ui/editorial";
import { ILLUSTRATION_STYLES, ILLUSTRATION_STYLE_LABELS, type IllustrationStyle } from "@/lib/constants/illustrationStyles";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface LandmarkPhoto {
  url: string;
  credit?: string | undefined;
}

export interface PlaceSetupState {
  status?: 'suggested' | 'confirmed' | undefined;
}

interface PhotoCandidate {
  url: string;
  thumbUrl: string;
  credit: string;
  title: string;
}

export interface PlaceSuggestion {
  value: string;
  count: number;
  sampleTitles: string[];
}

export interface PictureReferencesPatch {
  landmarks?: string[] | undefined;
  landmark_descriptions?: Record<string, string> | undefined;
  landmark_reference_images?: Record<string, LandmarkPhoto[]> | undefined;
  landmark_setup_state?: Record<string, any> | undefined;
}

interface PictureReferencesProps {
  topicId: string;
  topicName: string;
  region?: string | undefined;
  landmarks: string[];
  descriptions: Record<string, string>;
  photos: Record<string, LandmarkPhoto[]>;
  setupState: Record<string, PlaceSetupState>;
  illustrationStyle?: IllustrationStyle | undefined;
  onIllustrationStyleChange?: (style: IllustrationStyle) => void;
  onChange: (patch: PictureReferencesPatch) => void;
}

const MAX_PHOTOS = 3;

export function PictureReferences({
  topicId,
  topicName,
  region,
  landmarks,
  descriptions,
  photos,
  setupState,
  illustrationStyle,
  onIllustrationStyleChange,
  onChange,
}: PictureReferencesProps) {
  const { toast } = useToast();
  const [newPlace, setNewPlace] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [draftDescriptions, setDraftDescriptions] = useState<Record<string, string>>({});
  const [describing, setDescribing] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Record<string, PhotoCandidate[]>>({});
  const [photoLink, setPhotoLink] = useState<Record<string, string>>({});
  const [suggestions, setSuggestions] = useState<PlaceSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [openSample, setOpenSample] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stateFor = (place: string): PlaceSetupState => setupState[place] || {};
  const isConfirmed = (place: string) => stateFor(place).status === 'confirmed';
  const readyCount = landmarks.filter((place) => isConfirmed(place) && (descriptions[place] || (photos[place] || []).length > 0)).length;

  const persist = useCallback(async (patch: PictureReferencesPatch) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq('id', topicId);
      if (error) throw error;
      onChange(patch);
    } catch (error) {
      console.error('Error saving picture references:', error);
      toast({ title: "Error", description: "Couldn't save — try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [topicId, onChange, toast]);

  // Fetch place suggestions mined from the feed's own recent stories.
  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('coverage-suggestions', {
        body: { topicId, kind: 'places' },
      });
      if (error) throw error;
      setSuggestions(((data as any)?.places || []) as PlaceSuggestion[]);
    } catch (error) {
      console.error('Error loading place suggestions:', error);
    } finally {
      setSuggestionsLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const addPlace = async (placeToAdd?: string) => {
    const place = (placeToAdd || newPlace).trim();
    if (!place || landmarks.includes(place)) return;
    setNewPlace('');
    setExpanded(place);
    await persist({
      landmarks: [...landmarks, place],
      landmark_setup_state: { ...setupState, [place]: { status: 'suggested' } },
    });
    // Automatically write the appearance note and look up reference photos —
    // the owner only reviews and confirms.
    autoDescribe(place);
    autoSearchPhotos(place);
  };

  const autoDescribe = async (place: string) => {
    setDescribing(place);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-regional-elements', {
        body: {
          topicId,
          topicName,
          region,
          mode: 'describe',
          landmark: place,
          imageUrls: (photos[place] || []).map((p) => p.url),
        },
      });
      if (error) throw error;
      const description = (data as any)?.description;
      if (!description) throw new Error('No description returned');
      const next = { ...descriptions, [place]: description };
      setDraftDescriptions((prev) => ({ ...prev, [place]: description }));
      await persist({ landmark_descriptions: next });
    } catch (error) {
      console.error('Error describing place:', error);
      toast({ title: "Couldn't write a description", description: "You can type one yourself below." });
    } finally {
      setDescribing(null);
    }
  };

  const autoSearchPhotos = async (place: string) => {
    setPhotoBusy(place);
    try {
      const { data, error } = await supabase.functions.invoke('landmark-photos', {
        body: { topicId, mode: 'search', landmark: place, region },
      });
      if (error) throw error;
      const results = ((data as any)?.results || []) as PhotoCandidate[];
      setCandidates((prev) => ({ ...prev, [place]: results }));
      if (results.length === 0) {
        toast({ title: "No photos found", description: "Upload one or paste a link instead" });
      }
    } catch (error) {
      console.error('Error searching for photos:', error);
    } finally {
      setPhotoBusy(null);
    }
  };

  const saveDescription = async (place: string) => {
    const value = (draftDescriptions[place] ?? descriptions[place] ?? '').trim().slice(0, 400);
    if (value === (descriptions[place] ?? '')) return;
    const next = { ...descriptions };
    if (value) next[place] = value;
    else delete next[place];
    setDraftDescriptions((prev) => ({ ...prev, [place]: value }));
    await persist({ landmark_descriptions: next });
  };

  const importPhoto = async (place: string, payload: { sourceUrl?: string | undefined; credit?: string | undefined; fileBase64?: string | undefined; contentType?: string | undefined }) => {
    const current = photos[place] || [];
    if (current.length >= MAX_PHOTOS) {
      toast({ title: "Three photos is the limit", description: "Remove one first" });
      return;
    }
    setPhotoBusy(place);
    try {
      const { data, error } = await supabase.functions.invoke('landmark-photos', {
        body: { topicId, mode: 'import', landmark: place, ...payload },
      });
      if (error) throw error;
      const url = (data as any)?.url;
      if (!url) throw new Error((data as any)?.error || 'No image returned');
      const next = { ...photos, [place]: [...current, { url, credit: (data as any)?.credit || payload.credit }].slice(0, MAX_PHOTOS) };
      setCandidates((prev) => ({ ...prev, [place]: (prev[place] || []).filter((c) => c.url !== payload.sourceUrl) }));
      await persist({ landmark_reference_images: next });
    } catch (error) {
      console.error('Error adding photo:', error);
      toast({ title: "Error", description: "Couldn't add that photo", variant: "destructive" });
    } finally {
      setPhotoBusy(null);
    }
  };

  const removePhoto = async (place: string, index: number) => {
    const current = photos[place] || [];
    const next = { ...photos };
    const remaining = current.filter((_, i) => i !== index);
    if (remaining.length > 0) next[place] = remaining;
    else delete next[place];
    await persist({ landmark_reference_images: next });
  };

  const confirmPlace = async (place: string) => {
    await saveDescription(place);
    await persist({ landmark_setup_state: { ...setupState, [place]: { status: 'confirmed' } } });
    setExpanded(null);
  };

  const removePlace = async (place: string) => {
    const previous = {
      landmarks: [...landmarks],
      descriptions: { ...descriptions },
      photos: { ...photos },
      setupState: { ...setupState },
    };
    const nextLandmarks = landmarks.filter((p) => p !== place);
    const nextDescriptions = { ...descriptions };
    delete nextDescriptions[place];
    const nextPhotos = { ...photos };
    delete nextPhotos[place];
    const nextSetup = { ...setupState };
    delete nextSetup[place];
    await persist({
      landmarks: nextLandmarks,
      landmark_descriptions: nextDescriptions,
      landmark_reference_images: nextPhotos,
      landmark_setup_state: nextSetup,
    });
    setExpanded(null);
    toast({
      title: `${place} removed`,
      description: "Reference photos and its note were removed too",
      action: (
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            persist({
              landmarks: previous.landmarks,
              landmark_descriptions: previous.descriptions,
              landmark_reference_images: previous.photos,
              landmark_setup_state: previous.setupState,
            })
          }
        >
          Undo
        </Button>
      ),
    });
  };

  const dismissSuggestion = async (value: string) => {
    const dismissed = { ...((setupState as any)?.dismissed || {}), [value]: true };
    const next = { ...setupState, dismissed };
    setSuggestions((prev) => prev.filter((s) => s.value !== value));
    await persist({ landmark_setup_state: next });
  };

  const pending = landmarks.filter((place) => !isConfirmed(place));
  const confirmed = landmarks.filter(isConfirmed);

  const renderDetail = (place: string) => {
    const placeCandidates = candidates[place] || [];
    const placePhotos = photos[place] || [];
    const draft = draftDescriptions[place] ?? descriptions[place] ?? '';
    return (
      <div className="space-y-3 pt-2">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            Appearance note
            <InfoHint label="About the appearance note">
              What this place actually looks like. Covers follow this note instead of guessing. Curatr drafts it —
              edit freely, or leave it blank.
            </InfoHint>
          </p>
          {describing === place && !draft ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-3 w-3 animate-pulse" /> Writing a description…</p>
          ) : (
            <Textarea
              value={draft}
              onChange={(e) => setDraftDescriptions((prev) => ({ ...prev, [place]: e.target.value }))}
              onBlur={() => saveDescription(place)}
              placeholder="Massing, roofline, materials, windows, setting…"
              rows={2}
              maxLength={400}
              className="text-sm"
            />
          )}
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
            Reference photos
            <InfoHint label="About reference photos">
              Up to {MAX_PHOTOS} photos, used so the architecture is right when a story is about this place.
            </InfoHint>
          </p>
          {placePhotos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {placePhotos.map((photo, photoIndex) => (
                <div key={photo.url} className="relative">
                  <img
                    src={photo.url}
                    alt={`${place} reference ${photoIndex + 1}`}
                    loading="lazy"
                    className="h-16 w-24 rounded object-cover border"
                  />
                  <button
                    type="button"
                    onClick={() => removePhoto(place, photoIndex)}
                    aria-label={`Remove reference photo ${photoIndex + 1}`}
                    className="absolute -top-1 -right-1 rounded-full bg-background border p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {photoBusy === place && placeCandidates.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Sparkles className="h-3 w-3 animate-pulse" /> Looking for photos…</p>
          )}
          {placeCandidates.length > 0 && (
            <div className="space-y-2 rounded-lg border p-2">
              <div className="flex flex-wrap gap-2">
                {placeCandidates.map((candidate) => (
                  <button
                    key={candidate.url}
                    type="button"
                    disabled={photoBusy === place}
                    title={candidate.credit}
                    onClick={() => importPhoto(place, { sourceUrl: candidate.url, credit: candidate.credit })}
                    className="rounded overflow-hidden border hover:ring-2 hover:ring-primary"
                  >
                    <img src={candidate.thumbUrl} alt={candidate.title} loading="lazy" className="h-16 w-24 object-cover" />
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" disabled={photoBusy === place} onClick={() => autoSearchPhotos(place)}>
              <ImageIcon className="h-3 w-3 mr-1" />
              {photoBusy === place ? 'Working…' : 'Find more photos'}
            </Button>
            <label className="text-sm underline cursor-pointer">
              Upload
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => importPhoto(place, { fileBase64: String(reader.result), contentType: file.type });
                    reader.onerror = () => toast({ title: "Error", description: "Couldn't read that file", variant: "destructive" });
                    reader.readAsDataURL(file);
                  }
                }}
              />
            </label>
            <Input
              value={photoLink[place] ?? ''}
              onChange={(e) => setPhotoLink((prev) => ({ ...prev, [place]: e.target.value }))}
              placeholder="Paste an image link…"
              className="h-8 text-sm flex-1 min-w-[160px]"
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={photoBusy === place || !(photoLink[place] || '').trim()}
              onClick={async () => {
                const link = (photoLink[place] || '').trim();
                if (!link) return;
                await importPhoto(place, { sourceUrl: link });
                setPhotoLink((prev) => ({ ...prev, [place]: '' }));
              }}
            >
              Add
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Button size="sm" onClick={() => confirmPlace(place)} disabled={saving}>
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Done — collapse this place
          </Button>
          <Button size="sm" variant="ghost" onClick={() => removePlace(place)} className="text-destructive hover:text-destructive">
            <X className="h-3 w-3 mr-1" /> Remove place
          </Button>
        </div>
      </div>
    );
  };

  return (
    <div className="divide-y divide-border border-y border-border">
      {onIllustrationStyleChange && (
        <SettingRow label="Illustration style" hint="How drawn story covers look.">
          <Select
            value={illustrationStyle || ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE}
            onValueChange={(v) => onIllustrationStyleChange(v as IllustrationStyle)}
          >
            <SelectTrigger id="visual-style" aria-label="Illustration style" className="h-11 w-56 text-base"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.CARTOON}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.CARTOON]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.BW_EDITORIAL_PHOTO}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.BW_EDITORIAL_PHOTO]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.ANIME}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.ANIME]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.SATIRICAL}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.SATIRICAL]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.ILLUSTRATED_ICON}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.ILLUSTRATED_ICON]}
              </SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      )}

      <SettingRow id="picture-references-heading" label="Place pictures" hint={landmarks.length > 0 ? `${readyCount} of ${landmarks.length} ready. Reference photos help pictures show the real buildings.` : "Places your feed writes about, so pictures show the real buildings."} stack>
      <div className="space-y-4">
      {pending.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {pending.length === 1 ? '1 place is' : `${pending.length} places are`} awaiting confirmation.
        </p>
      )}


      <div className="flex gap-2">
        <Input
          value={newPlace}
          onChange={(e) => setNewPlace(e.target.value)}
          placeholder="Add a place, landmark or venue…"
          onKeyDown={(e) => e.key === 'Enter' && addPlace()}
          className="h-11 text-base"
          aria-label="Add a place"
        />
        <Button onClick={() => addPlace()} variant="outline" className="h-11" aria-label="Add place" disabled={saving}>
          <MapPin className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-2">
        {[...pending, ...confirmed].map((place) => {
          const placeConfirmed = isConfirmed(place);
          const isOpen = expanded === place;
          const thumb = (photos[place] || [])[0];
          return (
            <div key={place} className="rounded-lg border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                onClick={() => setExpanded(isOpen ? null : place)}
                aria-expanded={isOpen}
              >
                <span className="flex min-w-0 items-center gap-3">
                  {thumb ? (
                    <img src={thumb.url} alt="" loading="lazy" className="h-9 w-14 shrink-0 rounded object-cover border" />
                  ) : (
                    <span className="flex h-9 w-14 shrink-0 items-center justify-center rounded border bg-muted">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                    </span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium">{place}</span>
                    <span className="block text-sm text-muted-foreground">
                      {placeConfirmed
                        ? `${(photos[place] || []).length} ${((photos[place] || []).length === 1) ? 'photo' : 'photos'} · ready`
                        : 'Awaiting your confirmation'}
                    </span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {placeConfirmed && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </span>
              </button>
              {isOpen && renderDetail(place)}
            </div>
          );
        })}
        {landmarks.length === 0 && (
          <p className="text-base text-muted-foreground">No places yet.</p>
        )}
      </div>

      <div>
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between text-base font-medium"
          onClick={() => setSuggestionsOpen((open) => !open)}
          aria-expanded={suggestionsOpen}
        >
          <span className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
            Suggested from your recent stories
            {suggestions.length > 0 && <Badge variant="secondary">{suggestions.length}</Badge>}
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${suggestionsOpen ? 'rotate-180' : ''}`} />
        </button>
        {suggestionsOpen && (
          <div className="mt-3 space-y-2">
            {suggestionsLoading && <p className="text-sm text-muted-foreground">Looking through your recent stories…</p>}
            {!suggestionsLoading && suggestions.length === 0 && (
              <p className="text-sm text-muted-foreground">Nothing new.</p>
            )}
            {suggestions.map((suggestion) => (
              <div key={suggestion.value} className="flex items-start justify-between gap-3 rounded-lg border p-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{suggestion.value}</p>
                  <button
                    type="button"
                    className="text-sm text-muted-foreground underline-offset-2 hover:underline"
                    onClick={() => setOpenSample(openSample === suggestion.value ? null : suggestion.value)}
                  >
                    Seen in {suggestion.count} recent {suggestion.count === 1 ? 'story' : 'stories'}
                  </button>
                  {openSample === suggestion.value && (
                    <ul className="mt-1 space-y-0.5">
                      {suggestion.sampleTitles.map((title) => (
                        <li key={title} className="truncate text-sm text-muted-foreground">“{title}”</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => addPlace(suggestion.value)}>Add</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(suggestion.value)} aria-label={`Dismiss ${suggestion.value}`}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      </div>
      </SettingRow>
    </div>
  );
}
