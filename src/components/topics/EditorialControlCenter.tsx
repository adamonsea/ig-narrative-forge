import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Gauge,
  Globe2,
  Mail,
  MapPin,
  Mic2,
  Palette,
  Radio,
  Rss,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { PictureReferences } from "@/components/topics/PictureReferences";
import { CoverageTerms } from "@/components/topics/CoverageTerms";
import { AiAssistantAccess } from "@/components/topics/AiAssistantAccess";
import { TopicNegativeKeywords } from "@/components/TopicNegativeKeywords";
import { NewsValuesPanel } from "@/components/topics/NewsValuesPanel";
import { ContentVoiceSettings } from "@/components/ContentVoiceSettings";
import { TopicAutomationSettings } from "@/components/TopicAutomationSettings";
import { DripFeedSettings } from "@/components/DripFeedSettings";
import { TopicDonationSettings } from "@/components/TopicDonationSettings";
import { TopicBrandingSettings } from "@/components/TopicBrandingSettings";
import { OnboardingSettings } from "@/components/onboarding";
import { TopicInsightSettings } from "@/components/TopicInsightSettings";
import { SentimentKeywordSettings } from "@/components/SentimentKeywordSettings";
import { CommunityVoiceSettings } from "@/components/CommunityVoiceSettings";
import { RegionalFeaturesSettings } from "@/components/RegionalFeaturesSettings";
import { NewsletterSignupsManager } from "@/components/NewsletterSignupsManager";
import { WidgetAnalytics } from "@/components/WidgetAnalytics";
import { ILLUSTRATION_STYLE_LABELS, type IllustrationStyle } from "@/lib/constants/illustrationStyles";
import { getDial, parseNearbyPlaces } from "@/lib/newsValues";
import { cn } from "@/lib/utils";

export interface EditorialTopic {
  id: string;
  name: string;
  slug: string;
  topic_type: "regional" | "keyword";
  keywords: string[];
  region?: string;
  landmarks?: string[];
  landmark_descriptions?: Record<string, string>;
  landmark_reference_images?: Record<string, { url: string; credit?: string }[]>;
  landmark_setup_state?: Record<string, any>;
  coverage_setup_state?: Record<string, any>;
  postcodes?: string[];
  organizations?: string[];
  audience_expertise?: "beginner" | "intermediate" | "expert";
  default_tone?: "formal" | "conversational" | "engaging" | "satirical" | "rhyming_couplet";
  default_writing_style?: "journalistic" | "educational" | "listicle" | "story_driven";
  illustration_style?: IllustrationStyle;
  illustration_primary_color?: string;
  house_style_notes?: string | null;
  house_style_examples?: string | null;
  locality_strength?: number;
  nearby_places?: unknown;
  big_story_override?: boolean;
  community_intelligence_enabled?: boolean;
  community_pulse_frequency?: number;
  community_config?: { subreddits?: string[]; last_processed?: string; processing_frequency_hours?: number };
  parliamentary_tracking_enabled?: boolean;
  events_enabled?: boolean;
  event_source_url?: string;
  branding_config?: unknown;
  donation_enabled?: boolean;
  donation_config?: unknown;
  drip_feed_enabled?: boolean;
  public_widget_builder_enabled?: boolean;
  rss_enabled?: boolean;
  mcp_enabled?: boolean;
  mcp_access?: "open" | "key";
  email_subscriptions_enabled?: boolean;
  audio_briefings_daily_enabled?: boolean;
  audio_briefings_weekly_enabled?: boolean;
  is_public: boolean;
}

interface EditorialStats {
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  simplified_stories_24h: number;
  email_subscribers_total?: number;
}

type SectionKey = "overview" | "coverage" | "voice" | "automation" | "distribution" | "identity" | "features";

interface EditorialControlCenterProps {
  topic: EditorialTopic;
  stats: EditorialStats;
  negativeKeywords: string[];
  onNegativeKeywordsChange: (keywords: string[]) => void;
  onTopicChange: (topic: EditorialTopic) => void;
  onUpdate: () => void;
  onChannelToggle: (field: string, checked: boolean, label: string) => void;
  onToast: (title: string, description?: string) => void;
}

const titleCase = (value?: string) => value ? value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Not set";

export function EditorialControlCenter({
  topic,
  stats,
  negativeKeywords,
  onNegativeKeywordsChange,
  onTopicChange,
  onUpdate,
  onChannelToggle,
  onToast,
}: EditorialControlCenterProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedSection = searchParams.get("section") as SectionKey | null;
  const section: SectionKey = ["coverage", "voice", "automation", "distribution", "identity", "features"].includes(requestedSection || "")
    ? requestedSection as SectionKey
    : "overview";

  const openSection = (next: SectionKey) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "overview") nextParams.delete("section");
    else nextParams.set("section", next);
    setSearchParams(nextParams, { replace: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const dial = getDial(topic.locality_strength ?? 3);
  const nearbyCount = parseNearbyPlaces(topic.nearby_places).length;
  const activeChannels = [
    topic.is_public,
    topic.email_subscriptions_enabled,
    topic.rss_enabled,
    topic.public_widget_builder_enabled,
    topic.audio_briefings_daily_enabled,
    topic.audio_briefings_weekly_enabled,
  ].filter(Boolean).length;

  const policy = useMemo(() => {
    const place = topic.topic_type === "regional"
      ? `${dial.label.toLowerCase()} coverage${nearbyCount ? ` across ${nearbyCount} nearby ${nearbyCount === 1 ? "place" : "places"}` : ""}`
      : `${topic.keywords.length} discovery ${topic.keywords.length === 1 ? "term" : "terms"}`;
    const exception = topic.topic_type === "regional" && topic.big_story_override !== false ? ", with strong nearby stories allowed" : "";
    return `Prioritise ${topic.region || topic.name}; use ${place}${exception}.`;
  }, [topic, dial.label, nearbyCount]);

  const unconfirmedPlaces = (topic.landmarks || []).filter(
    (place) => topic.landmark_setup_state?.[place]?.status !== "confirmed"
  );
  const attention: { text: string; section?: SectionKey; anchor?: string }[] = [
    stats.pending_articles > 20 ? { text: `${stats.pending_articles} arrivals are waiting for editorial review` } : null,
    stats.processing_queue > 10 ? { text: `${stats.processing_queue} stories are still being prepared` } : null,
    !topic.is_public ? { text: "This feed is private and cannot currently reach readers", section: "distribution" } : null,
    (topic.landmarks || []).length > 0 && unconfirmedPlaces.length > 0
      ? { text: `${unconfirmedPlaces.length} ${unconfirmedPlaces.length === 1 ? "place is" : "places are"} waiting for your confirmation in Picture references`, section: "coverage", anchor: "picture-references-heading" }
      : null,
    (topic.landmarks || []).length === 0
      ? { text: "Add picture references so illustrations draw your local places accurately", section: "coverage", anchor: "picture-references-heading" }
      : null,
  ].filter((item): item is { text: string; section?: SectionKey; anchor?: string } => Boolean(item));

  const goToAttention = (item: { section?: SectionKey; anchor?: string }) => {
    if (!item.section) return;
    openSection(item.section);
    if (item.anchor) {
      window.setTimeout(() => {
        document.getElementById(item.anchor!)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 120);
    }
  };

  const controls = [
    {
      key: "coverage" as const,
      icon: MapPin,
      eyebrow: "What belongs",
      title: "Coverage",
      summary: topic.topic_type === "regional"
        ? `${dial.label} · ${nearbyCount} nearby ${nearbyCount === 1 ? "place" : "places"}`
        : `${topic.keywords.length} discovery ${topic.keywords.length === 1 ? "term" : "terms"}`,
    },
    {
      key: "voice" as const,
      icon: BookOpen,
      eyebrow: "How stories feel",
      title: "Voice & presentation",
      summary: `${titleCase(topic.default_tone || "conversational")} · ${titleCase(topic.default_writing_style || "journalistic")}`,
    },
    {
      key: "automation" as const,
      icon: Gauge,
      eyebrow: "What Curatr may do",
      title: "Automation",
      summary: "Choose the level of editorial control",
    },
    {
      key: "distribution" as const,
      icon: Radio,
      eyebrow: "Where readers find it",
      title: "Distribution",
      summary: `${activeChannels} active ${activeChannels === 1 ? "channel" : "channels"}`,
    },
  ];

  if (section !== "overview") {
    const headings: Record<Exclude<SectionKey, "overview">, { title: string; copy: string }> = {
      coverage: { title: "Coverage", copy: "Define what belongs in this feed and what should wait for your judgement." },
      voice: { title: "Voice & presentation", copy: "Set the audience, writing character and visual treatment for every story." },
      automation: { title: "Automation", copy: "Choose what Curatr may prepare or publish without waiting for you." },
      distribution: { title: "Distribution", copy: "Control where the feed reaches readers and monitor each destination." },
      identity: { title: "Identity", copy: "Shape how the feed introduces itself and appears to readers." },
      features: { title: "Optional features", copy: "Turn on specialist editorial tools only when they are useful." },
    };
    const heading = headings[section];

    return (
      <div className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-4 border-b border-border pb-6">
          <Button variant="ghost" size="sm" className="-ml-3" onClick={() => openSection("overview")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Editorial control
          </Button>
          <div>
            <h2 className="text-2xl font-semibold text-foreground">{heading.title}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{heading.copy}</p>
          </div>
        </header>

        {section === "coverage" && (
          <div className="space-y-10">
            {topic.topic_type === "regional" && (
              <section aria-labelledby="news-values-heading">
                <h3 id="news-values-heading" className="mb-4 text-base font-semibold">News values</h3>
                <NewsValuesPanel
                  topicId={topic.id}
                  region={topic.region}
                  landmarks={topic.landmarks}
                  postcodes={topic.postcodes}
                  organizations={topic.organizations}
                  localityStrength={topic.locality_strength}
                  nearbyPlaces={topic.nearby_places}
                  bigStoryOverride={topic.big_story_override}
                  onChange={(values) => onTopicChange({ ...topic, ...values })}
                />
              </section>
            )}
            <section className="border-t border-border pt-8" aria-labelledby="discovery-heading">
              <h3 id="discovery-heading" className="mb-1 text-base font-semibold">Coverage terms</h3>
              <p className="mb-5 text-sm text-muted-foreground">Words that tell Curatr what belongs — suggested from your own recent stories.</p>
              <CoverageTerms
                topicId={topic.id}
                keywords={topic.keywords}
                setupState={topic.coverage_setup_state || {}}
                onChange={(patch) => onTopicChange({ ...topic, ...patch })}
              />
            </section>
            <section className="border-t border-border pt-8" aria-labelledby="exclusions-heading">
              <h3 id="exclusions-heading" className="mb-1 text-base font-semibold">Exclusions</h3>
              <p className="mb-5 text-sm text-muted-foreground">Keep predictable near-misses out of the review queue.</p>
              <TopicNegativeKeywords topicId={topic.id} negativeKeywords={negativeKeywords} onUpdate={onNegativeKeywordsChange} />
            </section>
          </div>
        )}

        {section === "voice" && (
          <div className="space-y-10">
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
            <section className="border-t border-border pt-8" aria-labelledby="picture-references-heading">
              <PictureReferences
                topicId={topic.id}
                topicName={topic.name}
                region={topic.region}
                landmarks={topic.landmarks || []}
                descriptions={topic.landmark_descriptions || {}}
                photos={topic.landmark_reference_images || {}}
                setupState={topic.landmark_setup_state || {}}
                onChange={(patch) => onTopicChange({ ...topic, ...patch })}
              />
            </section>
          </div>
        )}

        {section === "automation" && (
          <div className="space-y-10">
            <TopicAutomationSettings topicId={topic.id} />
            <section className="border-t border-border pt-8">
              <h3 className="mb-4 text-base font-semibold">Publishing pace</h3>
              <DripFeedSettings topicId={topic.id} onUpdate={onUpdate} />
            </section>
          </div>
        )}

        {section === "distribution" && (
          <div className="divide-y divide-border border-y border-border">
            <ChannelRow icon={Globe2} label="Public feed" description={topic.is_public ? "Visible to readers" : "Private"} checked={topic.is_public} disabled />
            <ChannelRow icon={Mail} label="Email" description={`${stats.email_subscribers_total || 0} subscribers`} checked={topic.email_subscriptions_enabled || false} onCheckedChange={(checked) => onChannelToggle("email_subscriptions_enabled", checked, "Email subscriptions")} />
            {topic.email_subscriptions_enabled && <div className="py-6"><NewsletterSignupsManager topicId={topic.id} /></div>}
            <ChannelRow icon={Rss} label="RSS" description="A live feed for reader apps" checked={topic.rss_enabled || false} onCheckedChange={(checked) => onChannelToggle("rss_enabled", checked, "RSS feed")} />
            <ChannelRow icon={Settings2} label="Website widget" description="Embed this feed on another website" checked={topic.public_widget_builder_enabled || false} onCheckedChange={(checked) => onChannelToggle("public_widget_builder_enabled", checked, "Widget builder")} />
            {topic.public_widget_builder_enabled && (
              <div className="space-y-4 py-6">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/feed/${topic.slug}/widget`} target="_blank"><ExternalLink className="mr-2 h-4 w-4" />Open widget builder</Link>
                </Button>
                <WidgetAnalytics topicId={topic.id} onNewSiteDetected={(domain) => onToast("New widget integration", `Your widget is now live on ${domain}`)} />
              </div>
            )}
            <ChannelRow icon={Mic2} label="Daily audio" description="A daily spoken briefing" checked={topic.audio_briefings_daily_enabled || false} onCheckedChange={(checked) => onChannelToggle("audio_briefings_daily_enabled", checked, "Daily audio briefings")} />
            <ChannelRow icon={Mic2} label="Weekly audio" description="A weekly spoken review" checked={topic.audio_briefings_weekly_enabled || false} onCheckedChange={(checked) => onChannelToggle("audio_briefings_weekly_enabled", checked, "Weekly audio briefings")} />
            <AiAssistantAccess
              topicId={topic.id}
              topicSlug={topic.slug}
              topicName={topic.name}
              enabled={topic.mcp_enabled || false}
              access={topic.mcp_access === "open" ? "open" : "key"}
              onChange={(patch) => onTopicChange({ ...topic, ...patch })}
            />
            <div className="py-7"><TopicDonationSettings topicId={topic.id} donationEnabled={topic.donation_enabled || false} donationConfig={(topic.donation_config as never) || { button_text: "Support this feed", tiers: [] }} onUpdate={onUpdate} /></div>
          </div>
        )}

        {section === "identity" && (
          <div className="space-y-10">
            <section>
              <h3 className="mb-4 text-base font-semibold">Brand</h3>
              <TopicBrandingSettings topic={{ id: topic.id, name: topic.name, illustration_primary_color: topic.illustration_primary_color, branding_config: topic.branding_config as never }} onUpdate={onUpdate} />
            </section>
            <section className="border-t border-border pt-8">
              <h3 className="mb-1 text-base font-semibold">Welcome & About</h3>
              <p className="mb-5 text-sm text-muted-foreground">Introduce the feed to first-time readers and explain its purpose.</p>
              <OnboardingSettings topic={{ id: topic.id, name: topic.name, slug: topic.slug, branding_config: topic.branding_config as never }} onUpdate={onUpdate} />
            </section>
          </div>
        )}

        {section === "features" && (
          <div className="space-y-10">
            <section><h3 className="mb-4 text-base font-semibold">Insight cards</h3><TopicInsightSettings topicId={topic.id} /></section>
            <section className="border-t border-border pt-8"><h3 className="mb-4 text-base font-semibold">Sentiment tracking</h3><SentimentKeywordSettings topicId={topic.id} /></section>
            <section className="border-t border-border pt-8"><h3 className="mb-1 text-base font-semibold">Community signals</h3><p className="mb-5 text-sm text-muted-foreground">Monitor community discussion without changing the feed’s writing voice.</p><CommunityVoiceSettings topicId={topic.id} enabled={topic.community_intelligence_enabled} pulseFrequency={topic.community_pulse_frequency} config={topic.community_config} topicType={topic.topic_type} region={topic.region} onUpdate={onUpdate} /></section>
            {topic.topic_type === "regional" && <section className="border-t border-border pt-8"><h3 className="mb-4 text-base font-semibold">Local reporting tools</h3><RegionalFeaturesSettings topicId={topic.id} region={topic.region} parliamentaryEnabled={topic.parliamentary_tracking_enabled} eventsEnabled={topic.events_enabled} eventSourceUrl={topic.event_source_url} onUpdate={onUpdate} /></section>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      <header className="border-b border-border pb-7">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="mb-2 text-xs font-medium uppercase text-muted-foreground">Editorial control</p>
            <h2 className="text-2xl font-semibold text-foreground">Your feed at a glance</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">See what needs judgement, then tune how Curatr selects, prepares and shares stories.</p>
          </div>
          <Badge variant={topic.is_public ? "default" : "secondary"} className="w-fit gap-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", topic.is_public ? "bg-pop" : "bg-muted-foreground")} />
            {topic.is_public ? "Live" : "Private"}
          </Badge>
        </div>
      </header>

      <section aria-labelledby="flow-heading">
        <div className="mb-4 flex items-center justify-between">
          <div><h3 id="flow-heading" className="text-base font-semibold">Current flow</h3><p className="text-sm text-muted-foreground">What is moving through the newsroom now.</p></div>
          <Button variant="ghost" size="sm" asChild><Link to="?tab=feed">Open pipeline <ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border border-y border-border sm:grid-cols-4 sm:divide-y-0">
          <FlowMetric value={stats.pending_articles} label="Arrivals to review" />
          <FlowMetric value={stats.processing_queue} label="Being prepared" />
          <FlowMetric value={stats.ready_stories} label="Ready" />
          <FlowMetric value={stats.simplified_stories_24h} label="Prepared today" />
        </div>
      </section>

      {attention.length > 0 && (
        <section className="border-l-2 border-destructive bg-destructive/5 px-5 py-4" aria-labelledby="attention-heading">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div><h3 id="attention-heading" className="text-sm font-semibold">Needs your attention</h3><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{attention.map((item) => <li key={item.text}>{item.section ? <button type="button" onClick={() => goToAttention(item)} className="text-left underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground">{item.text}</button> : item.text}</li>)}</ul></div>
          </div>
        </section>
      )}

      <section aria-labelledby="policy-heading" className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        <div>
          <h3 id="policy-heading" className="text-base font-semibold">Editorial policy</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{policy}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {controls.map(({ key, icon: Icon, eyebrow, title, summary }) => (
            <Button key={key} type="button" variant="outline" onClick={() => openSection(key)} className="group h-auto min-h-44 flex-col items-stretch justify-start whitespace-normal p-5 text-left hover:border-primary/40 hover:bg-accent/40">
              <div className="flex items-start justify-between gap-4"><div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-foreground"><Icon className="h-4 w-4" /></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div>
              <p className="mt-5 text-xs font-medium uppercase text-muted-foreground">{eyebrow}</p>
              <h4 className="mt-1 font-semibold text-foreground">{title}</h4>
              <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
            </Button>
          ))}
        </div>
      </section>

      <section className="grid gap-3 border-t border-border pt-8 sm:grid-cols-2">
        <SecondarySection icon={Palette} title="Identity" copy="Brand, colour, welcome and About" onClick={() => openSection("identity")} />
        <SecondarySection icon={Sparkles} title="Optional features" copy="Insights, sentiment, community and local tools" onClick={() => openSection("features")} />
      </section>
    </div>
  );
}

function FlowMetric({ value, label }: { value: number; label: string }) {
  return <div className="px-4 py-5 sm:px-6"><p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>;
}

function SecondarySection({ icon: Icon, title, copy, onClick }: { icon: typeof Palette; title: string; copy: string; onClick: () => void }) {
  return <Button variant="ghost" className="h-auto justify-between px-4 py-4 text-left" onClick={onClick}><span className="flex items-center gap-3"><Icon className="h-4 w-4 text-muted-foreground" /><span><span className="block text-sm font-medium">{title}</span><span className="block text-xs font-normal text-muted-foreground">{copy}</span></span></span><ArrowRight className="h-4 w-4 text-muted-foreground" /></Button>;
}

function ChannelRow({ icon: Icon, label, description, checked, onCheckedChange, disabled = false }: { icon: typeof Mail; label: string; description: string; checked: boolean; onCheckedChange?: (checked: boolean) => void; disabled?: boolean }) {
  return <div className="flex items-center justify-between gap-5 py-5"><div className="flex items-center gap-3"><Icon className="h-4 w-4 text-muted-foreground" /><div><Label className="text-sm">{label}</Label><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div></div>{disabled ? <CheckCircle2 className="h-4 w-4 text-primary" /> : <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={`Enable ${label}`} />}</div>;
}
