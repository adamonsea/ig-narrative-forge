import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { ArrowRight, ArrowLeft, X, Loader2, Plus, CheckCircle, ExternalLink, Newspaper, LayoutList } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { FeedBuildProgress } from "@/components/FeedBuildProgress";
import { SourceScanLoop, ClippingStackLoop, SourceChipSkeletons, PulsingDots } from "@/components/onboarding/WaitingAnimations";
import { FeedSetupPreview, type SetupSource } from "@/components/feed-setup/FeedSetupPreview";
import {
  slugify,
  nameCandidate,
  draftFromSuggestion,
  topicInsertFromDraft,
  automationFromDraft,
  type FeedSetupDraft,
} from "@/lib/feedSetup";

interface StoryPreview {
  id: string;
  title: string;
}

interface CreateTopicDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTopicCreated: (topicSlug: string) => void;
  /** Pre-fills the first answer (e.g. a blueprint chosen on the homepage). */
  initialName?: string;
  /** Pre-fills the words to look for. */
  initialKeywords?: string[];
}

type Step = "about" | "name" | "thinking" | "sources" | "preview" | "building" | "done";

const EXAMPLES = ["Pokémon", "Eastbourne", "Jazz in Brighton", "Life sciences", "Cyclo-cross"];
const MAX_NAME_LENGTH = 60;

const THINKING_MESSAGES = [
  "Choosing a name and colour…",
  "Finding publications that cover this…",
  "Checking each source works…",
  "Deciding what to look for…",
];

const BLOCKED_HOSTS = ["facebook.com", "twitter.com", "instagram.com", "tiktok.com", "reddit.com", "pinterest.com", "linkedin.com", "youtube.com", "medium.com"];

/** Filters and ranks suggested sources; returns them with the ones to start ticked. */
function rankSources(raw: SetupSource[]): { list: SetupSource[]; picked: Set<string> } {
  const list = raw
    .filter((s) => s.confidence_score >= 60 && s.platform_reliability !== "low" && !BLOCKED_HOSTS.some((b) => s.url.toLowerCase().includes(b)))
    .sort((a, b) => {
      const score = (s: SetupSource) => s.confidence_score + (s.platform_reliability === "high" ? 25 : s.platform_reliability === "medium" ? 15 : 0);
      return score(b) - score(a);
    });
  const picked = new Set<string>();
  list.slice(0, 5).forEach((s) => picked.add(s.url));
  return { list, picked };
}

export const CreateTopicDialog = ({ open, onOpenChange, onTopicCreated, initialName, initialKeywords }: CreateTopicDialogProps) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const [step, setStep] = useState<Step>("about");
  const [manual, setManual] = useState(false);

  const [about, setAbout] = useState("");
  const [exampleIndex, setExampleIndex] = useState(0);
  const [thinkingIndex, setThinkingIndex] = useState(0);

  // "Set it up myself": the owner's own name
  const [manualName, setManualName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [checkingName, setCheckingName] = useState(false);

  const [draft, setDraft] = useState<FeedSetupDraft | null>(null);
  const [sources, setSources] = useState<SetupSource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [findingSources, setFindingSources] = useState(false);

  const [topicId, setTopicId] = useState<string | null>(null);
  const [topicSlug, setTopicSlug] = useState("");
  const [createdSourceIds, setCreatedSourceIds] = useState<string[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [sourceFailures, setSourceFailures] = useState(0);
  const [attemptedSourceCount, setAttemptedSourceCount] = useState(0);
  const [completedStories, setCompletedStories] = useState<StoryPreview[]>([]);
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setExampleIndex((i) => (i + 1) % EXAMPLES.length), 2600);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (step !== "thinking") { setThinkingIndex(0); return; }
    const t = setInterval(() => setThinkingIndex((i) => (i + 1) % THINKING_MESSAGES.length), 2600);
    return () => clearInterval(t);
  }, [step]);

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
    setFindingSources(false);
    setTopicId(null);
    setTopicSlug("");
    setCreatedSourceIds([]);
    setIsCreating(false);
    setSourceFailures(0);
    setAttemptedSourceCount(0);
    setCompletedStories([]);
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

  const fetchSetup = async (subject: string) => {
    const { data, error } = await supabase.functions.invoke("suggest-feed-setup", { body: { about: subject } });
    if (error || !data?.setup) throw new Error("We couldn't prepare suggestions just now. Please try again.");
    return data.setup;
  };

  const fetchSources = async (d: FeedSetupDraft) => {
    setFindingSources(true);
    try {
      const { data } = await supabase.functions.invoke("suggest-content-sources", {
        body: {
          topicName: d.name,
          description: d.description,
          keywords: d.keywords.slice(0, 12).join(", "),
          topicType: d.topic_type,
          region: d.region || undefined,
        },
      });
      const { list, picked } = rankSources((data?.suggestions || []) as SetupSource[]);
      setSources(list);
      setSelected(picked);
    } catch {
      setSources([]);
      setSelected(new Set());
    } finally {
      setFindingSources(false);
    }
  };

  /** Picks the first free name: "Name", then "Name 2", "Name 3"… */
  const freeName = async (base: string) => {
    for (let attempt = 1; attempt <= 9; attempt++) {
      const candidate = nameCandidate(base, attempt);
      const { data } = await supabase.rpc("check_topic_slug_available", { p_slug: slugify(candidate) });
      if (data !== false) return candidate;
    }
    return nameCandidate(base, Date.now() % 1000);
  };

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
      await fetchSources(next);
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

      const { data: topicData, error: topicError } = await supabase
        .from("topics")
        .insert(topicInsertFromDraft(finalDraft, slug, user.id) as any)
        .select("id")
        .single();
      if (topicError) {
        if (topicError.code === "23505") throw new Error("A feed with this name already exists.");
        throw topicError;
      }
      setTopicId(topicData.id);

      // The settings row is created with the feed; switch on Autopilot (or hold for review).
      const { error: automationError } = await supabase
        .from("topic_automation_settings")
        .update({ ...automationFromDraft(finalDraft), updated_at: new Date().toISOString() } as any)
        .eq("topic_id", topicData.id);
      if (automationError) {
        console.error("Autopilot not saved:", automationError);
        toast({ title: "Autopilot is not on yet", description: "Switch it on in Settings once your feed opens." });
      }

      const chosen = sources.filter((s) => selected.has(s.url));
      setAttemptedSourceCount(chosen.length);
      const sourceIds: string[] = [];
      let failures = 0;
      for (const source of chosen) {
        try {
          const domain = new URL(source.url).hostname.replace("www.", "");
          const { data: existingRows } = await supabase
            .from("content_sources")
            .select("id")
            .or(`feed_url.eq.${source.url},canonical_domain.eq.${domain}`)
            .limit(1);
          const existing = existingRows?.[0];
          if (existing) {
            sourceIds.push(existing.id);
            continue;
          }
          let credibility = Math.round(source.confidence_score * 0.8);
          if (source.platform_reliability === "high") credibility += 15;
          if (source.platform_reliability === "medium") credibility += 10;
          const { data: newSource, error: sourceError } = await supabase
            .from("content_sources")
            .insert({
              source_name: source.source_name,
              feed_url: source.url,
              canonical_domain: domain,
              content_type: "news",
              credibility_score: Math.min(95, credibility),
              is_active: true,
              source_type: source.type === "RSS" ? "rss" : "website",
              region: finalDraft.topic_type === "regional" ? finalDraft.region : null,
              // Required: sources may only be added to a feed the signed-in owner owns.
              topic_id: topicData.id,
            })
            .select("id")
            .single();
          if (sourceError) throw sourceError;
          if (newSource) sourceIds.push(newSource.id);
        } catch (e) {
          failures += 1;
          console.error("Source creation failed:", source.url, e);
        }
      }
      setSourceFailures(failures);
      setCreatedSourceIds(sourceIds);
      if (sourceIds.length === 0) setTimeout(() => setStep("done"), 1200);
    } catch (error) {
      console.error("Feed creation error:", error);
      const message = error instanceof Error ? error.message : "The feed could not be created";
      setBuildError(message);
      toast({ title: "Not created", description: message, variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const handleBuildComplete = useCallback((stories: StoryPreview[]) => {
    setCompletedStories(stories);
    setStep("done");
  }, []);

  const handleBuildError = useCallback((error: string) => {
    setBuildError(error);
    setStep("done");
  }, []);

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
                      <div className="space-y-3 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">What's your feed about?</h1>
                        <p className="text-lg text-muted-foreground">A subject, a place, or both. We'll suggest everything else.</p>
                      </div>
                      <Input
                        value={about}
                        onChange={(e) => setAbout(e.target.value.slice(0, 80))}
                        placeholder={EXAMPLES[exampleIndex]}
                        aria-label="What your feed is about"
                        className="h-16 rounded-xl border-2 text-center text-xl font-medium placeholder:text-muted-foreground/50 focus:border-primary md:text-2xl"
                        autoFocus
                        onKeyDown={(e) => { if (e.key === "Enter" && about.trim().length >= 2) handleAboutContinue(); }}
                      />
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
                      <div className="space-y-2 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Name your feed</h1>
                        <p className="text-muted-foreground">Next you'll choose its sources and what it looks for.</p>
                      </div>
                      <div className="relative">
                        <Input
                          value={manualName}
                          onChange={(e) => setManualName(e.target.value)}
                          placeholder="e.g. Eastbourne Today"
                          aria-label="Feed name"
                          className={cn("h-16 rounded-xl border-2 text-center text-xl font-medium md:text-2xl", nameError ? "border-destructive" : "focus:border-primary")}
                          autoFocus
                          onKeyDown={(e) => { if (e.key === "Enter") handleNameContinue(); }}
                        />
                        {checkingName && <Loader2 className="absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 animate-spin text-muted-foreground" />}
                      </div>
                      {nameError && <p className="text-center text-sm text-destructive">{nameError}</p>}
                    </motion.div>
                  )}

                  {step === "thinking" && (
                    <motion.div key="thinking" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center space-y-8 py-6" aria-live="polite">
                      <SourceScanLoop />
                      <div className="space-y-2 text-center">
                        <p className="text-xl font-medium">Setting up "{about.trim()}"</p>
                        <motion.p key={thinkingIndex} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="text-muted-foreground">
                          {THINKING_MESSAGES[thinkingIndex]}
                        </motion.p>
                      </div>
                      <SourceChipSkeletons count={6} />
                    </motion.div>
                  )}

                  {step === "sources" && (
                    <motion.div key="sources" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                      <div className="space-y-2 text-center">
                        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Choose sources</h1>
                        <p className="text-muted-foreground">Tap to include or leave out. You can add your own.</p>
                      </div>
                      {findingSources || !draft ? (
                        <div className="flex flex-col items-center space-y-6 py-6" aria-live="polite">
                          <SourceScanLoop />
                          <p className="text-muted-foreground">Finding publications that cover "{manualName.trim()}"…</p>
                          <SourceChipSkeletons count={6} />
                        </div>
                      ) : (
                        <SourcesPicker sources={sources} selected={selected} onToggle={toggleSource} onAdd={addSource} onSelectAll={() => setSelected(new Set(sources.map((s) => s.url)))} />
                      )}
                    </motion.div>
                  )}

                  {step === "preview" && draft && (
                    <motion.div key="preview" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
                      <p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
                        {manual ? "Check the details" : "Here's your feed"}
                      </p>
                      <FeedSetupPreview
                        draft={draft}
                        onChange={setDraft}
                        sources={sources}
                        selected={selected}
                        onToggleSource={toggleSource}
                        onAddSource={addSource}
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
                      ) : topicId && createdSourceIds.length > 0 ? (
                        <FeedBuildProgress
                          topicId={topicId}
                          topicSlug={topicSlug}
                          topicName={draft?.name || ""}
                          sourceIds={createdSourceIds}
                          connectedNote={sourceFailures > 0 ? `${createdSourceIds.length} of ${attemptedSourceCount} sources connected` : undefined}
                          onComplete={handleBuildComplete}
                          onError={handleBuildError}
                        />
                      ) : (
                        <div className="flex min-h-[40vh] flex-col items-center justify-center space-y-6" aria-live="polite">
                          <ClippingStackLoop />
                          <p className="text-muted-foreground">Creating your feed…</p>
                          <PulsingDots />
                        </div>
                      )}
                    </motion.div>
                  )}

                  {step === "done" && (
                    <motion.div key="done" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center space-y-8">
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/20">
                        <CheckCircle className="h-8 w-8 text-accent-foreground" />
                      </div>
                      <div className="space-y-2 text-center">
                        <h2 className="text-3xl font-semibold tracking-tight">
                          {completedStories.length > 0 ? "Your feed is live" : "Your feed is set up"}
                        </h2>
                        <p className="text-lg text-muted-foreground">
                          {completedStories.length > 0
                            ? draft?.autopilot
                              ? `${completedStories.length} stories so far. Autopilot will keep it up to date.`
                              : `${completedStories.length} stories are waiting on your Desk.`
                            : "Stories will appear as your sources publish them."}
                        </p>
                      </div>
                      {completedStories.length > 0 && (
                        <ul className="w-full max-w-sm space-y-2">
                          {completedStories.slice(0, 3).map((story) => (
                            <li key={story.id} className="flex items-center gap-3 rounded-lg border border-border bg-muted/50 p-3">
                              <Newspaper className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                              <span className="truncate text-sm">{story.title}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      <div className="flex w-full max-w-xs flex-col items-center gap-3">
                        <Button size="lg" className="w-full gap-2" onClick={() => { const slug = topicSlug; handleClose(); window.open(`/feed/${slug}`, "_blank"); }}>
                          <ExternalLink className="h-4 w-4" aria-hidden="true" />
                          See your feed
                        </Button>
                        <Button variant="ghost" className="text-muted-foreground" onClick={() => { const slug = topicSlug; onTopicCreated(slug); handleClose(); }}>
                          Open the Desk
                        </Button>
                      </div>
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
