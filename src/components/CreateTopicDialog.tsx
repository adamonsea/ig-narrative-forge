import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, ArrowLeft, X, Loader2, Plus, CheckCircle, LayoutList } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { FindingSources, type FoundChip } from "@/components/feed-setup/FindingSources";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { FeedBuildProgress } from "@/components/FeedBuildProgress";
import { PulsingDots } from "@/components/onboarding/WaitingAnimations";
import { FeedSetupPreview, type SetupSource } from "@/components/feed-setup/FeedSetupPreview";
import {
  slugify,
  draftFromSuggestion,
  looksLikePlace,
  type EventSourceSuggestion,
  type FeedSetupDraft,
} from "@/lib/feedSetup";

import { createFeedFromDraft } from "@/lib/feedSetup/createFeed";
import { freeFeedName, suggestFeedSetup, findSetupNews, findSetupEvents } from "@/lib/feedSetup/prepareFeed";

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopicCreated: (topicSlug: string) => void;
  /** Pre-fills the first answer (e.g. a blueprint chosen on the homepage). */
  initialName?: string | undefined;
  /** Pre-fills the words to look for. */
  initialKeywords?: string[] | undefined;
}

type Step = "about" | "name" | "thinking" | "sources" | "preview" | "building";

const EXAMPLES = ["Pokémon", "Eastbourne", "Jazz in Brighton", "Life sciences", "Cyclo-cross"];
const MAX_NAME_LENGTH = 60;

const REVEAL_MS = 520;

export const CreateTopicDialog = ({ open, onOpenChange, onTopicCreated, initialName, initialKeywords }: CreateTopicDialogProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("about");
  const [manual, setManual] = useState(false);

  const [about, setAbout] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  // "Include what's on": guessed from the sentence until the owner flips it
  const [includeEvents, setIncludeEvents] = useState(false);
  const [eventsTouched, setEventsTouched] = useState(false);
  const [eventSources, setEventSources] = useState<EventSourceSuggestion[]>([]);
  const [eventSelected, setEventSelected] = useState<Set<string>>(new Set());

  // "Set it up myself": the owner's own name
  const [manualName, setManualName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);

  const [draft, setDraft] = useState<FeedSetupDraft | null>(null);
  const [sources, setSources] = useState<SetupSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // A website typed in the add box but not yet added still counts when the feed is created.
  const pendingSource = useRef("");
  const [findingSources, setFindingSources] = useState(false);

  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicSlug, setTopicSlug] = useState("");
  const [createdSourceIds, setCreatedSourceIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [sourceFailures, setSourceFailures] = useState(0);
  const [attemptedSourceCount, setAttemptedSourceCount] = useState(0);
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setExampleIndex((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!eventsTouched) setIncludeEvents(looksLikePlace(about));
  }, [about, eventsTouched]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const resetForm = () => {
    setStep("about");
    setManual(false);
    setAbout("");
    setManualName("");
    setNameError(null);
    setDraft(null);
    setSources([]);
    setSelected(new Set());
    pendingSource.current = "";
    setFindingSources(false);
    setIncludeEvents(false);
    setEventsTouched(false);
    setEventSources([]);
    setEventSelected(new Set());
    setTopicId(null);
    setTopicSlug("");
    setCreatedSourceIds([]);
    setIsCreating(false);
    setSourceFailures(0);
    setAttemptedSourceCount(0);
    setBuildError(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step !== "building") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step]);

  // Homepage blueprint: start from its title.
  useEffect(() => {
    if (!open) return;
    if (initialName && !about) setAbout(initialName.slice(0, 80));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialName]);

  // Manual name check (debounced, server-side so other people's private feeds count).
  useEffect(() => {
    if (step !== "name") return;
    const trimmed = manualName.trim();
    if (trimmed.length < 3) { setNameError(null); return; }
    if (trimmed.length > MAX_NAME_LENGTH) { setNameError(`Keep the name under ${MAX_NAME_LENGTH} characters`); return; }
    const slug = slugify(trimmed);
    if (!slug) { setNameError("Use at least one letter or number"); return; }
    const t = setTimeout(async () => {
      setCheckingName(true);
      try {
        const { data, error } = await supabase.rpc("check_topic_slug_available", { p_slug: slug });
        if (error) throw error;
        setNameError(data === false ? `A feed called "${trimmed}" already exists` : null);
      } catch {
        setNameError(null);
      } finally {
        setCheckingName(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [manualName, step]);

  const fetchSetup = (subject: string) => suggestFeedSetup(supabase, subject);

  /** News and what's-on sources are searched together; events never hold up news. Returns how many were found. */
  const fetchSources = async (d: FeedSetupDraft): Promise<number> => {
    setFindingSources(true);
    const wantEvents = eventsTouched ? includeEvents : d.topic_type === "regional";
    if (!eventsTouched) setIncludeEvents(wantEvents);
    const news = findSetupNews(supabase, d)
      .then(({ list, picked }) => { setSources(list as SetupSource[]); setSelected(picked); return list.length; })
      .catch(() => { setSources([]); setSelected(new Set()); return 0; });
    const events = wantEvents ? findSetupEvents(supabase, d)
      .then(({ list, picked }) => { setEventSources(list); setEventSelected(picked); return list.length; })
      .catch(() => { setEventSources([]); setEventSelected(new Set()); return 0; })
      : Promise.resolve(0).then((n) => { setEventSources([]); setEventSelected(new Set()); return n; });
    const [a, b] = await Promise.all([news, events]);
    setFindingSources(false);
    return a + b;
  };

  /** Picks the first free name: "Name", then "Name 2", "Name 3"… */
  const freeName = (base: string) => freeFeedName(supabase, base);

  // Fast path: one sentence → everything suggested.
  const handleAboutContinue = async () => {
    const subject = about.trim();
    if (subject.length < 2) return;
    setManual(false);
    setStep("thinking");
    try {
      const setup = await fetchSetup(subject);
      const name = await freeName(setup.name || subject);
      const next = draftFromSuggestion(setup, name);
      if (initialKeywords?.length) next.keywords = Array.from(new Set([...next.keywords, ...initialKeywords.map((k) => k.toLowerCase())]));
      setDraft(next);
      const found = await fetchSources(next);
      // Let the found chips land before moving on
      await new Promise((res) => setTimeout(res, found * REVEAL_MS + 1100));
      setStep("preview");
    } catch (e) {
      toast({ title: "Something went wrong", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      setStep("about");
    }
  };

  // Hand-built path: the owner's own name, then choose sources, then check details.
  const canContinueName = manualName.trim().length >= 3 && !!slugify(manualName) && !nameError && !checkingName;
  const handleNameContinue = async () => {
    if (!canContinueName) return;
    setStep("sources");
    try {
      const setup = await fetchSetup(manualName.trim());
      const next = draftFromSuggestion(setup, manualName.trim().slice(0, MAX_NAME_LENGTH));
      setDraft(next);
      await fetchSources(next);
    } catch (e) {
      toast({ title: "Something went wrong", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
      setStep("name");
    }
  };

  const toggleSource = (url: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });

  const addSource = (raw: string): string | null => {
    const value = raw.trim();
    if (!value) return null;
    let parsed: URL;
    try {
      parsed = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
      if (!parsed.hostname.includes(".")) throw new Error("bad host");
    } catch {
      return "That doesn't look like a website address";
    }
    const url = parsed.toString();
    if (sources.some((s) => s.url === url)) return "That source is already in the list";
    setSources((prev) => [...prev, { url, source_name: parsed.hostname.replace(/^www\./, ""), type: "News", confidence_score: 70, rationale: "Added by you" }]);
    setSelected((prev) => new Set(prev).add(url));
    return null;
  };

  // "Looks good": create the feed, its sources and Autopilot, then gather the first stories.
  const handleCreate = async () => {
    if (!user || !draft || isCreating) return;
    setIsCreating(true);
    setStep("building");
    try {
      const name = manual ? draft.name.trim() : await freeName(draft.name.trim() || about.trim());
      const slug = slugify(name);
      if (!slug) throw new Error("Please choose a name with at least one letter or number.");
      const finalDraft = { ...draft, name };
      setTopicSlug(slug);

      const chosen = sources.filter((s) => selected.has(s.url));
      const typed = pendingSource.current.trim();
      if (typed) {
        try {
          const parsed = new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
          const url = parsed.toString();
          if (parsed.hostname.includes(".") && !chosen.some((c) => c.url === url)) {
            chosen.push({ url, source_name: parsed.hostname.replace(/^www\./, ""), type: "News", confidence_score: 70, rationale: "Added by you" });
          }
        } catch { /* not a website address: ignore */ }
      }
      setAttemptedSourceCount(chosen.length);
      const chosenEvents = eventSources.filter((e) => eventSelected.has(e.url));
      const result = await createFeedFromDraft(supabase, finalDraft, {
        ownerId: user.id, slug, isPublic: true, news: chosen, hasEvents: chosenEvents.length > 0,
      });
      setTopicId(result.feed.id);
      setSourceFailures(result.failures);
      setCreatedSourceIds(result.sourceIds);
    } catch (error) {
      console.error("Feed creation error:", error);
      const message = error instanceof Error ? error.message : "The feed could not be created";
      setBuildError(message);
      toast({ title: "Not created", description: message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const toggleEventSource = (url: string) =>
    setEventSelected((prev) => {
      const next = new Set(prev);
      if (next.has(url)) next.delete(url); else next.add(url);
      return next;
    });

  const foundChips: FoundChip[] = [
    ...sources.map((s) => ({ url: s.url, name: s.source_name, group: "news" as const })),
    ...eventSources.map((e) => ({ url: e.url, name: e.name, group: "events" as const })),
  ];

  if (!open) return null;

  const showFooter = step === "about" || step === "name" || step === "sources" || step === "preview";

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 bg-background"
          role="dialog"
          aria-modal="true"
          aria-label="Create a feed"
        >
          <button
            onClick={handleClose}
            className="absolute right-5 top-5 z-10 rounded-full p-2 transition-colors hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-6 w-6 text-muted-foreground" />
          </button>

          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto px-6">
              <div className={cn("mx-auto pb-32", step === "preview" ? "max-w-xl pt-14" : "max-w-lg pt-20 md:pt-28")}>
                <AnimatePresence mode="wait">
                  {step === "about" && (
                    <motion.div key="about" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-8">
                      <h1 className="text-center text-2xl font-semibold">What's your feed about?</h1>
                      <Input
                        value={about}
                        onChange={(e) => setAbout(e.target.value.slice(0, 80))}
                        placeholder={EXAMPLES[exampleIndex]}
                        aria-label="What your feed is about"
                        className="h-12 rounded-lg text-center text-base placeholder:text-muted-foreground"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && about.trim().length >= 2) handleAboutContinue(); }}
                      />
                      <div className="flex items-center justify-center gap-3">
                        <Switch
                          id="setup-include-events"
                          checked={includeEvents}
                          onCheckedChange={(v) => { setEventsTouched(true); setIncludeEvents(v); }}
                        />
                        <label htmlFor="setup-include-events" className="text-base">Include what's on</label>
                      </div>
                      <div className="text-center">
                        <button
                          type="button"
                          onClick={() => { setManual(true); setManualName(about.trim()); setStep("name"); }}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                        >
                          <LayoutList className="h-4 w-4" aria-hidden="true" />
                          Set it up myself
                        </button>
                      </div>
                    </motion.div>
                  )}

                  {step === "name" && (
                    <motion.div key="name" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                      <h1 className="text-center text-2xl font-semibold">Name your feed</h1>
                      <div className="relative">
                        <Input
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder="e.g. Eastbourne Today"
                          aria-label="Feed name"
                          className={cn("h-12 rounded-lg text-center text-base", nameError && "border-destructive")}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleNameContinue(); }}
                        />
                        {checkingName && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                      </div>
                      {nameError && <p className="text-center text-sm text-destructive">{nameError}</p>}
                    </motion.div>
                  )}

                  {step === "thinking" && (
                    <motion.div key="thinking" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      <FindingSources name={draft?.name || about.trim()} chips={foundChips} done={!!draft && !findingSources} />
                    </motion.div>
                  )}

                  {step === "sources" && (
                    <motion.div key="sources" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                      {findingSources || !draft ? (
                        <FindingSources name={manualName.trim()} chips={foundChips} done={false} />
                      ) : (
                        <>
                        <h1 className="text-center text-2xl font-semibold">Choose sources</h1>
                        <SourcesPicker sources={sources} selected={selected} onToggle={toggleSource} onAdd={addSource} onSelectAll={() => setSelected(new Set(sources.map((s) => s.url)))} />
                        </>
                      )}
                    </motion.div>
                  )}

                  {step === "preview" && draft && (
                    <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                      <p className="text-sm text-muted-foreground">
                        {manual ? "Check the details" : "Here's your feed"}
                      </p>
                      <FeedSetupPreview
                        draft={draft}
                        onChange={setDraft}
                        sources={sources}
                        selected={selected}
                        onToggleSource={toggleSource}
                        onAddSource={addSource}
                        onPendingSource={(v) => { pendingSource.current = v; }}
                        eventSources={eventSources}
                        eventSelected={eventSelected}
                        onToggleEventSource={toggleEventSource}
                        nameLocked={manual}
                      />
                    </motion.div>
                  )}

                  {step === "building" && (
                    <motion.div key="building" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      {buildError && !topicId ? (
                        <div className="space-y-4 py-16 text-center">
                          <p className="font-medium text-destructive">{buildError}</p>
                          <Button variant="outline" onClick={() => { setBuildError(null); setStep("preview"); }}>Back</Button>
                        </div>
                      ) : topicId && !isCreating ? (
                        <FeedBuildProgress
                          topicId={topicId}
                          topicName={draft?.name || ""}
                          colour={draft?.colour || "#0B1522"}
                          sourceIds={createdSourceIds}
                          eventSources={eventSources.filter((e) => eventSelected.has(e.url)).map((e) => ({ url: e.url, name: e.name, kind: e.kind }))}
                          connectedNote={sourceFailures > 0 ? `${createdSourceIds.length} of ${attemptedSourceCount} sources connected` : undefined}
                          onSeeFeed={() => { const slug = topicSlug; handleClose(); window.open(`/@${slug}`, "_blank"); }}
                          onOpenDesk={() => { const slug = topicSlug; onTopicCreated(slug); handleClose(); }}
                        />
                      ) : (
                        <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-6" aria-live="polite">
                          <p className="text-xl text-muted-foreground">Creating your feed…</p>
                          <PulsingDots />
                        </div>
                      )}
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>

            {showFooter && (
              <div className="flex-shrink-0 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
                <div className={cn("mx-auto flex items-center justify-between px-6 py-4", step === "preview" ? "max-w-xl" : "max-w-lg")}>
                  {step === "about" ? (
                    <Button variant="ghost" onClick={handleClose}>Cancel</Button>
                  ) : (
                    <Button
                      variant="ghost"
                      className="gap-2"
                      onClick={() => setStep(step === "preview" ? (manual ? "sources" : "about") : step === "sources" ? "name" : "about")}
                    >
                      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                      Back
                    </Button>
                  )}
                  {step === "about" && (
                    <Button size="lg" onClick={handleAboutContinue} disabled={about.trim().length < 2} className="gap-2">
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {step === "name" && (
                    <Button size="lg" onClick={handleNameContinue} disabled={!canContinueName} className="gap-2">
                      Continue
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {step === "sources" && (
                    <Button size="lg" onClick={() => setStep("preview")} disabled={findingSources || !draft} className="gap-2">
                      {selected.size === 0 ? "Continue without sources" : `Continue with ${selected.size}`}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                  {step === "preview" && (
                    <Button size="lg" onClick={handleCreate} disabled={isCreating || !draft?.name.trim()} className="gap-2">
                      Looks good
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

function SourcesPicker({
  sources,
  selected,
  onToggle,
  onAdd,
  onSelectAll,
}: {
  sources: SetupSource[];
  selected: Set<string>;
  onToggle: (url: string) => void;
  onAdd: (url: string) => string | null;
  onSelectAll: () => void;
}) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const e = onAdd(value);
    setError(e);
    if (!e) setValue("");
  };
  return (
    <div className="space-y-5">
      {sources.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{selected.size}</span> of {sources.length} chosen
            </p>
            <Button variant="ghost" size="sm" onClick={onSelectAll}>Choose all</Button>
          </div>
          <ul className="flex max-h-[45vh] flex-wrap gap-2.5 overflow-y-auto py-1">
            {sources.map((s) => {
              const on = selected.has(s.url);
              return (
                <li key={s.url}>
                  <button
                    type="button"
                    onClick={() => onToggle(s.url)}
                    aria-pressed={on}
                    title={s.rationale}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-colors",
                      on ? "border-primary bg-primary/10 text-foreground" : "border-border bg-muted/30 text-muted-foreground hover:border-muted-foreground/40",
                    )}
                  >
                    <span className="max-w-[200px] truncate">{s.source_name}</span>
                    {on && <CheckCircle className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {sources.length === 0 && <p className="text-center text-muted-foreground">No sources found automatically. Add a website address below.</p>}
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => { setValue(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }}
          placeholder="example.com"
          aria-label="Website address of a source"
          className="h-11"
        />
        <Button onClick={add} disabled={!value.trim()} className="h-11 gap-1">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
