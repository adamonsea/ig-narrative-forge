import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TermList } from "@/components/feed-setup/TermList";
import { CleanUpPastStories } from "@/components/settings/CleanUpPastStories";
import { addToList, dedupeTerms, freshSuggestions, normaliseTerm, removeTerm, type ListName } from "@/lib/termLists";

interface Suggestion {
  value: string;
  count: number;
  sampleTitles: string[];
}

type LookForPatch = { keywords?: string[]; negative_keywords?: string[]; coverage_setup_state?: Record<string, any> };

const LABEL: Record<ListName, string> = { more: "More of this", less: "Less of this" };

/**
 * "What we look for": the only place feed terms are shown and edited.
 * Two lists (no scores on screen), quiet suggestions under More of this, and
 * "Clean up past stories" beside Less of this. A term can only be in one list:
 * adding it to one moves it out of the other, with a brief note.
 */
export function LookForPanel({
  topicId,
  keywords,
  negativeKeywords,
  setupState,
  show = "both",
  onChange,
}: {
  topicId: string;
  keywords: string[];
  negativeKeywords: string[];
  setupState?: Record<string, any>;
  /** The setup guide shows one list per step. */
  show?: "both" | "more" | "less";
  onChange: (patch: LookForPatch) => void;
}) {
  const { toast } = useToast();
  const [state, setState] = useState<SaveState>(null);
  const [notice, setNotice] = useState<{ list: ListName; text: string } | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const noticeTimer = useRef<number | undefined>(undefined);
  const dismissed: Record<string, boolean> = setupState?.dismissedSuggestions || {};

  useEffect(() => () => window.clearTimeout(noticeTimer.current), []);

  useEffect(() => {
    if (show === "less") return;
    let cancelled = false;
    supabase.functions
      .invoke("coverage-suggestions", { body: { topicId, kind: "terms" } })
      .then(({ data }) => {
        if (!cancelled) setSuggestions(((data as any)?.terms || []) as Suggestion[]);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [topicId, show]);

  const save = useCallback(
    async (patch: LookForPatch, rescore: boolean) => {
      const previous: LookForPatch = { keywords, negative_keywords: negativeKeywords, coverage_setup_state: setupState };
      onChange(patch);
      setState("saving");
      const { error } = await supabase.from("topics").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", topicId);
      if (error) {
        onChange(previous);
        setState("not-saved");
        toast({ title: "Not saved", description: error.message, variant: "destructive" });
        return;
      }
      setState("saved");
      window.setTimeout(() => setState(null), 2000);
      // Waiting stories are re-checked against the new terms.
      if (rescore) void supabase.rpc("rescore_articles_for_topic", { p_topic_id: topicId });
    },
    [keywords, negativeKeywords, setupState, onChange, topicId, toast],
  );

  const add = (list: ListName, term: string) => {
    const result = addToList({ more: keywords, less: negativeKeywords }, list, term);
    if (!result.added) return;
    // Only the lists that actually changed are saved.
    const patch: LookForPatch = list === "more" ? { keywords: result.more } : { negative_keywords: result.less };
    if (result.movedFrom) Object.assign(patch, list === "more" ? { negative_keywords: result.less } : { keywords: result.more });
    void save(patch, true);
    window.clearTimeout(noticeTimer.current);
    if (result.movedFrom) {
      setNotice({ list, text: `“${normaliseTerm(term)}” moved from ${LABEL[result.movedFrom]}` });
      noticeTimer.current = window.setTimeout(() => setNotice(null), 4000);
    } else {
      setNotice(null);
    }
  };

  const remove = (list: ListName, term: string) => {
    void save(list === "more" ? { keywords: removeTerm(keywords, term) } : { negative_keywords: removeTerm(negativeKeywords, term) }, true);
  };

  const dismiss = (value: string) => {
    void save({ coverage_setup_state: { ...(setupState || {}), dismissedSuggestions: { ...dismissed, [value]: true } } }, false);
  };

  const offered = freshSuggestions(suggestions, { more: keywords, less: negativeKeywords }, dismissed);

  const more = (
    <TermList
      label={LABEL.more}
      hint="Stories that mention these belong in the feed."
      terms={dedupeTerms(keywords)}
      onAdd={(t) => add("more", t)}
      onRemove={(t) => remove("more", t)}
      notice={notice?.list === "more" ? notice.text : null}
    >
      {offered.length > 0 && (
        <div className="space-y-2 pt-1">
          <p className="text-xs text-muted-foreground">Suggested from your recent stories</p>
          <ul className="flex flex-wrap gap-2">
            {offered.map((s) => (
              <li key={s.value} className="inline-flex items-center rounded-full border border-dashed border-border text-sm text-muted-foreground">
                <button
                  type="button"
                  onClick={() => add("more", s.value)}
                  title={`Would match about ${s.count} recent ${s.count === 1 ? "story" : "stories"}${s.sampleTitles?.[0] ? `, e.g. “${s.sampleTitles[0]}”` : ""}`}
                  className="inline-flex items-center gap-1 rounded-l-full py-1 pl-2.5 pr-1 hover:text-foreground"
                  aria-label={`Add ${s.value} to More of this`}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  {s.value}
                </button>
                <button type="button" onClick={() => dismiss(s.value)} className="rounded-r-full p-1.5 hover:text-foreground" aria-label={`Don't suggest ${s.value} again`}>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </TermList>
  );

  const less = (
    <TermList
      label={LABEL.less}
      hint="Stories about these are left out."
      tone="less"
      terms={dedupeTerms(negativeKeywords)}
      onAdd={(t) => add("less", t)}
      onRemove={(t) => remove("less", t)}
      notice={notice?.list === "less" ? notice.text : null}
      headerAction={negativeKeywords.length > 0 ? <CleanUpPastStories topicId={topicId} /> : undefined}
    />
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><SaveIndicator state={state} /></div>
      {show === "both" ? (
        <div className="grid gap-10 md:grid-cols-2">{more}{less}</div>
      ) : show === "more" ? more : less}
    </div>
  );
}
