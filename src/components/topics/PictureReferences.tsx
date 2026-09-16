import { useCallback, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, ChevronDown, MapPin, Image as ImageIcon, Sparkles, X } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface LandmarkPhoto {
  url: string;
  credit?: string;
}

export interface PlaceSetupState {
  status?: 'suggested' | 'confirmed';
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
  landmarks?: string[];
  landmark_descriptions?: Record<string, string>;
  landmark_reference_images?: Record<string, LandmarkPhoto[]>;
  landmark_setup_state?: Record<string, any>;
}

interface PictureReferencesProps {
  topicId: string;
  topicName: string;
  region?: string;
  landmarks: string[];
  descriptions: Record<string, string>;
  photos: Record<string, LandmarkPhoto[]>;
  setupState: Record<string, PlaceSetupState>;
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
        .update({ ...patch, updated_at: new Date().toISOString() })
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
et      if (results.length === 0) {
        toast({ title: "No photos found", description: "Upload one or paste a link instead" });
      }
    } catch (error) {
      console.error('Error searching for photos:', error);
    } finally {
      setPhotoBusy(null);
    }
  };
