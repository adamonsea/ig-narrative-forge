import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Loader2, Sparkles } from "lucide-react";
import { TopicAwareSourceManager } from "@/components/TopicAwareSourceManager";
import { KeywordManager } from "@/components/KeywordManager";
import { TopicNegativeKeywords } from "@/components/TopicNegativeKeywords";
import { NewsValuesPanel } from "@/components/topics/NewsValuesPanel";
import { ContentVoiceSettings } from "@/components/ContentVoiceSettings";
import { TopicAutomationSettings } from "@/components/TopicAutomationSettings";
import { SourceScanLoop, ClippingStackLoop } from "@/components/onboarding/WaitingAnimations";
import { type IllustrationStyle } from "@/lib/constants/illustrationStyles";
import { cn } from "@/lib/utils";

export interface FeedSetupGuideTopic {
  id: string;
  name: string;
  slug: string;
  description?: string;
  topic_type: "regional" | "keyword";
  keywords?: string[];
  region?: string;
  landmarks?: string[];
  postcodes?: string[];
  organizations?: string[];
  default_tone?: "formal" | "conversational" | "engaging" | "satirical" | "rhyming_couplet";
  default_writing_style?: "journalistic" | "educational" | "listicle" | "story_driven";
  illustration_style?: IllustrationStyle;
  audience_expertise?: "beginner" | "intermediate" | "expert";
  house_style_notes?: string | null;
  house_style_examples?: string | null;
}

interface FeedSetupGuideProps {
  topic: FeedSetupGuideTopic;
  sourceCount: number;
  negativeKeywords: string[];
  competingRegions: string[];
  onNegativeKeywordsChange: (keywords: string[]) => void;
  onCompetingRegionsChange: (regions: string[]) => void;
  onTopicChange: (topic: any) => void;
  onUpdate: () => void;
  onGather: () => Promise<void> | void;
  gathering: boolean;
  onSkip: () => void;
}

const TOTAL_STEPS = 5;

export const storageKeyFor = (topicId: string) => `feed_setup_${topicId}`;

export const FeedSetupGuide = ({
  topic,
  sourceCount,
  negativeKeywords,
  competingRegions,
  onNegativeKeywordsChange,
  onCompetingRegionsChange,
  onTopicChange,
  onUpdate,
  onGather,
  gathering,
  onSkip,
}: FeedSetupGuideProps) => {
  const storageKey = storageKeyFor(topic.id);
  const [step, setStep] = useState(1);
  const [automationMode, setAutomationMode] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (typeof parsed.step === "number") setStep(Math.min(Math.max(parsed.step, 1), TOTAL_STEPS));
      }
    } catch {
      /* ignore */
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: number) => {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify({ step: next }));
      } catch {
        /* ignore */
      }
    },
    [storageKey]
  );

  const goTo = (next: number) => {
    const clamped = Math.min(Math.max(next, 1), TOTAL_STEPS);
    setStep(clamped);
    persist(clamped);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const finish = async () => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ step: TOTAL_STEPS, done: true }));
    } catch {
      /* ignore */
    }
    setStarted(true);
    await onGather();
  };

  const hasKeywords = (topic.keywords?.length || 0) > 0 || !!topic.region;

  const stepMeta = useMemo(
    () => [
      {
        title: "Add your sources",
        why: "Your feed only sees what your sources publish. Three to five good ones is plenty to start.",
      },
      {
        title: "Confirm what counts",
        why: "We use these to decide which stories belong in your feed and which get filtered out.",
      },
      {
        title: "Rule things out",
        why: "Stops near-miss stories from other places or subjects clogging your queue. You can skip this.",
      },
      {
        title: "Pick your voice",
        why: "Every story is rewritten in this voice — and illustrated in this style — before it reaches your readers.",
      },
      {
        title: "Choose how stories publish",
        why: "You can change this any time in Settings.",
      },
    ],
    []
  );

  const current = stepMeta[step - 1];
  const canAdvance = step === 1 ? sourceCount > 0 : step === 2 ? hasKeywords : true;

  if (started) {
    return (
      <section className="max-w-2xl mx-auto py-12 text-center space-y-6" aria-live="polite">
        <ClippingStackLoop />
        <h2 className="text-xl font-semibold text-foreground">Gathering your first stories</h2>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          We're reading your sources now. New arrivals appear in your pipeline within a few minutes — you don't
          need to wait here.
        </p>
        <Button onClick={onSkip}>Go to my pipeline</Button>
      </section>
    );
  }

  return (
    <section className="max-w-2xl mx-auto" aria-labelledby="setup-step-title">
      {/* Progress */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 flex gap-1.5" aria-hidden="true">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1 flex-1 rounded-full transition-colors",
                i < step ? "bg-primary" : "bg-muted"
              )}
            />
          ))}
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          Step {step} of {TOTAL_STEPS}
        </span>
      </div>

      <header className="mb-6 space-y-2">
        <p className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" /> Set up {topic.name}
        </p>
        <h2 id="setup-step-title" className="text-2xl font-semibold text-foreground">
          {current.title}
        </h2>
        <p className="text-sm text-muted-foreground">{current.why}</p>
      </header>

      <div className="space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            {sourceCount === 0 && (
              <div className="py-2">
                <SourceScanLoop className="w-28 h-28" />
              </div>
            )}
            <TopicAwareSourceManager
              selectedTopicId={topic.id}
              onSourcesChange={onUpdate}
              topicName={topic.name}
              description={topic.description || ""}
              keywords={topic.keywords || []}
              topicType={topic.topic_type}
              region={topic.region}
              articleCount={0}
            />
          </div>
        )}

        {step === 2 && (
          <KeywordManager
            topic={{
              id: topic.id,
              name: topic.name,
              topic_type: topic.topic_type,
              keywords: topic.keywords || [],
              region: topic.region,
              landmarks: topic.landmarks,
              landmark_descriptions: (topic as any).landmark_descriptions,
              postcodes: topic.postcodes,
              organizations: topic.organizations,
            }}
            onTopicUpdate={(updated) => onTopicChange(updated)}
          />
        )}

        {step === 3 && (
          <div className="space-y-4">
            <TopicNegativeKeywords
              topicId={topic.id}
              negativeKeywords={negativeKeywords}
              onUpdate={onNegativeKeywordsChange}
            />
            {topic.topic_type === "regional" && (
              <NewsValuesPanel
                topicId={topic.id}
                region={topic.region}
                landmarks={topic.landmarks}
                postcodes={topic.postcodes}
                organizations={topic.organizations}
                localityStrength={(topic as any).locality_strength}
                nearbyPlaces={(topic as any).nearby_places}
                bigStoryOverride={(topic as any).big_story_override}
              />
            )}
          </div>
        )}

        {step === 4 && (
          <ContentVoiceSettings
            topicId={topic.id}
            currentExpertise={topic.audience_expertise}
            currentTone={topic.default_tone}
            currentWritingStyle={topic.default_writing_style}
            currentIllustrationStyle={topic.illustration_style}
            currentHouseStyleNotes={topic.house_style_notes}
            currentHouseStyleExamples={topic.house_style_examples}
            onUpdate={onUpdate}
          />
        )}

        {step === 5 && (
          <TopicAutomationSettings topicId={topic.id} onModeChange={setAutomationMode} />
        )}
      </div>

      {/* Nav */}
      <div className="flex items-center justify-between mt-8 pt-4 border-t border-border/40">
        <Button variant="ghost" size="sm" onClick={onSkip}>
          Skip setup
        </Button>
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button variant="outline" size="sm" onClick={() => goTo(step - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1.5" /> Back
            </Button>
          )}
          {step < TOTAL_STEPS ? (
            <Button size="sm" onClick={() => goTo(step + 1)} disabled={!canAdvance}>
              {step === 3 && negativeKeywords.length === 0 && competingRegions.length === 0
                ? "Skip for now"
                : "Continue"}{" "}
              <ArrowRight className="w-4 h-4 ml-1.5" />
            </Button>
          ) : (
            <Button size="sm" onClick={finish} disabled={gathering || !automationMode}>
              {gathering ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : null}
              Gather first stories
            </Button>
          )}
        </div>
      </div>

      {step === 1 && sourceCount === 0 && (
        <p className="mt-3 text-xs text-muted-foreground text-right">Add at least one source to continue.</p>
      )}
      {step === 2 && !hasKeywords && (
        <p className="mt-3 text-xs text-muted-foreground text-right">Add at least one keyword to continue.</p>
      )}
    </section>
  );
};