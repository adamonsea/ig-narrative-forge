import { useCallback, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Plus, Sparkles, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

export interface TermSuggestion {
  value: string;
  count: number;
  sampleTitles: string[];
}

export interface CoverageTermsPatch {
  keywords?: string[];
  coverage_setup_state?: Record<string, any>;
}

interface CoverageTermsProps {
  topicId: string;
  keywords: string[];
  setupState: Record<string, any>;
  onChange: (patch: CoverageTermsPatch) => void;
}

export function CoverageTerms({ topicId, keywords, setupState, onChange }: CoverageTermsProps) {
  const { toast } = useToast();
  const [listOpen, setListOpen] = useState(false);
  const [newTerm, setNewTerm] = useState('');
  const [suggestions, setSuggestions] = useState<TermSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [openSample, setOpenSample] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dismissed: Record<string, boolean> = setupState?.dismissedSuggestions || {};

  const persist = useCallback(async (patch: CoverageTermsPatch) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({ ...patch, updated_at: new Date().toISOString() } as never)
        .eq('id', topicId);
      if (error) throw error;
      onChange(patch);
    } catch (error) {
      console.error('Error saving coverage terms:', error);
      toast({ title: "Error", description: "Couldn't save — try again", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [topicId, onChange, toast]);

  const loadSuggestions = useCallback(async () => {
    setSuggestionsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('coverage-suggestions', {
        body: { topicId, kind: 'terms' },
      });
      if (error) throw error;
      setSuggestions((((data as any)?.terms || []) as TermSuggestion[]).filter((s) => !dismissed[s.value]));
    } catch (error) {
      console.error('Error loading term suggestions:', error);
    } finally {
      setSuggestionsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const rescore = async () => {
    try {
      await supabase.rpc('rescore_articles_for_topic', { p_topic_id: topicId });
    } catch (error) {
      console.error('Error rescoring articles:', error);
    }
  };

  const addTerm = async (termToAdd?: string) => {
    const term = (termToAdd || newTerm).trim();
    if (!term || keywords.includes(term)) return;
    setNewTerm('');
    await persist({ keywords: [...keywords, term] });
    await rescore();
    toast({ title: `“${term}” added`, description: "Existing arrivals are being re-checked against it" });
  };

  const removeTerm = async (term: string) => {
    const nextKeywords = keywords.filter((k) => k !== term);
    await persist({ keywords: nextKeywords });
    await rescore();
    toast({
      title: `“${term}” removed`,
      description: "Stories matching only this term will stop appearing",
      action: (
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            await persist({ keywords: [term, ...nextKeywords] });
            await rescore();
          }}
        >
          Undo
        </Button>
      ),
    });
  };

  const dismissSuggestion = async (value: string) => {
    const next = { ...setupState, dismissedSuggestions: { ...dismissed, [value]: true } };
    setSuggestions((prev) => prev.filter((s) => s.value !== value));
    await persist({ coverage_setup_state: next });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">Coverage terms</h3>
          <p className="text-sm text-muted-foreground">
            Words that tell Curatr what belongs in this feed. Suggestions come from your own recent stories.
          </p>
        </div>
        <Badge variant="secondary" className="shrink-0">{keywords.length} {keywords.length === 1 ? 'term' : 'terms'}</Badge>
      </div>

      <div className="rounded-lg border p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-3.5 w-3.5 text-muted-foreground" />
          Suggested from your recent stories
        </p>
        <div className="space-y-2">
          {suggestionsLoading && <p className="text-xs text-muted-foreground">Looking through your recent stories…</p>}
          {!suggestionsLoading && suggestions.length === 0 && (
            <p className="text-xs text-muted-foreground">Nothing new suggested right now.</p>
          )}
          {suggestions.map((suggestion) => (
            <div key={suggestion.value} className="flex items-start justify-between gap-3 rounded-md border p-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{suggestion.value}</p>
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-2 hover:underline"
                  onClick={() => setOpenSample(openSample === suggestion.value ? null : suggestion.value)}
                >
                  Would match about {suggestion.count} recent {suggestion.count === 1 ? 'story' : 'stories'}
                </button>
                {openSample === suggestion.value && (
                  <ul className="mt-1 space-y-0.5">
                    {suggestion.sampleTitles.map((title) => (
                      <li key={title} className="truncate text-xs text-muted-foreground">“{title}”</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button size="sm" variant="outline" disabled={saving} onClick={() => addTerm(suggestion.value)}>
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => dismissSuggestion(suggestion.value)} aria-label={`Dismiss ${suggestion.value}`}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
          {suggestions.length > 0 && (
            <p className="text-[11px] text-muted-foreground">Dismissed suggestions are never offered again.</p>
          )}
        </div>
      </div>

      <div className="rounded-lg border">
        <button
          type="button"
          className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm font-medium"
          onClick={() => setListOpen((open) => !open)}
          aria-expanded={listOpen}
        >
          <span>
            {keywords.length === 0
              ? 'No terms yet'
              : keywords.length === 1
                ? '1 term in use'
                : `${keywords.length} terms in use`}
            <span className="ml-2 font-normal text-xs text-muted-foreground">
              {listOpen ? 'hide the full list' : 'review or remove terms'}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${listOpen ? 'rotate-180' : ''}`} />
        </button>
        {listOpen && (
          <div className="space-y-3 border-t px-3 pb-3 pt-3">
            <div className="flex flex-wrap gap-2">
              {keywords.map((term) => (
                <span key={term} className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                  {term}
                  <button
                    type="button"
                    onClick={() => removeTerm(term)}
                    aria-label={`Remove ${term}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              {keywords.length === 0 && (
                <p className="text-xs text-muted-foreground">Add the words your feed should always catch.</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTerm}
                onChange={(e) => setNewTerm(e.target.value)}
                placeholder="Add a term…"
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === 'Enter' && addTerm()}
              />
              <Button size="sm" variant="outline" disabled={saving} onClick={() => addTerm()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
