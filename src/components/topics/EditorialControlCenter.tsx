import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CircleAlert, ExternalLink, Globe2, Mail, Mic2, Rss, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { PictureReferences } from "@/components/topics/PictureReferences";
import { AiAssistantAccess } from "@/components/topics/AiAssistantAccess";
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
import { EmailSegmentsManager } from "@/components/EmailSegmentsManager";
import { WidgetAnalytics } from "@/components/WidgetAnalytics";
import { InfoHint } from "@/components/ui/editorial";
import { type IllustrationStyle } from "@/lib/constants/illustrationStyles";
import { CategoriesPanel } from "@/components/categories/CategoriesPanel";
import { RememberedFold, openFold } from "@/components/settings/RememberedFold";
import { BrandBasics } from "@/components/settings/BrandBasics";
import { LookForPanel } from "@/components/settings/LookForPanel";
import { AutopilotBasics } from "@/components/settings/AutopilotBasics";
import { ShareBasics } from "@/components/settings/ShareBasics";
import { FEATURES } from "@/lib/featureFlags";

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
  family_safe?: boolean;
  weekly_email_enabled?: boolean;
  is_public: boolean;
}

interface EditorialStats {
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  simplified_stories_24h: number;
  email_subscribers_total?: number;
}

/** Old ?section= links (help answers, bookmarks) → the section and fold that now hold them. */
const SECTION_TARGETS: Record<string, { anchor: string; folds: string[] }> = {
  identity: { anchor: "settings-brand", folds: ["brand-more"] },
  voice: { anchor: "voice-heading", folds: ["brand-more", "lookfor-more"] },
  coverage: { anchor: "settings-look-for", folds: ["lookfor-more"] },
  automation: { anchor: "settings-autopilot", folds: ["autopilot-more"] },
  distribution: { anchor: "settings-share", folds: ["share-more"] },
  features: { anchor: "settings-extras", folds: ["extras"] },
};

interface EditorialControlCenterProps {
  topic: EditorialTopic;
  stats: EditorialStats;
  negativeKeywords: string[];
  onNegativeKeywordsChange: (keywords: string[]) => void;
  onTopicChange: (topic: EditorialTopic) => void;
  onUpdate: () => void;
  onChannelToggle: (field: string, checked: boolean, label: string) => void;
  onToast: (title: string, description?: string) => void;
  onProRequired?: () => void;
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-6 border-t border-border pt-10 first:border-t-0 first:pt-0">
      <header>
        <h2 id={`${id}-title`} className="display-heading text-xl md:text-2xl">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function SubHeading({ id, children, hint }: { id?: string; children: React.ReactNode; hint?: string }) {
  return (
    <h3 id={id} className="mb-4 flex items-center gap-1.5 text-base font-semibold">
      {children}
      {hint && <InfoHint label={`About ${String(children).toLowerCase()}`}>{hint}</InfoHint>}
    </h3>
  );
}

/**
 * Settings: simple by default, deep on demand. Each section shows the few
 * choices most owners need; everything else is one tap away under
 * "More options", remembered per owner. Nothing that existed is removed.
 */
export function EditorialControlCenter({
  topic,
  stats,
  negativeKeywords,
  onNegativeKeywordsChange,
  onTopicChange,
  onUpdate,
  onChannelToggle,
  onToast,
  onProRequired,
}: EditorialControlCenterProps) {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get("section");
  const patch = (values: Partial<EditorialTopic> | Record<string, unknown>) => onTopicChange({ ...topic, ...(values as Partial<EditorialTopic>) });

  // Deep links open the right fold and scroll to it.
  useEffect(() => {
    const target = requested ? SECTION_TARGETS[requested] : null;
    if (!target) return;
    target.folds.forEach((fold) => openFold(user?.id, fold));
    const t = window.setTimeout(() => {
      document.getElementById(target.anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [requested, user?.id]);

  const unconfirmedPlaces = (topic.landmarks || []).filter((place) => topic.landmark_setup_state?.[place]?.status !== "confirmed");
  const attention: string[] = [];
  if (!topic.is_public) attention.push("This feed is a draft — readers can't see it yet. Use the Live switch at the top to publish it.");
  if ((topic.landmarks || []).length > 0 && unconfirmedPlaces.length > 0) {
    attention.push(`${unconfirmedPlaces.length} ${unconfirmedPlaces.length === 1 ? "place is" : "places are"} waiting for your confirmation in Picture references (What we look for → More options).`);
  }

  const brandKey = JSON.stringify([topic.name, topic.illustration_primary_color, topic.branding_config]);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      {attention.length > 0 && (
        <section className="border-l-2 border-destructive bg-destructive/5 px-5 py-4" aria-labelledby="attention-heading">
          <div className="flex gap-3">
            <CircleAlert className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <h2 id="attention-heading" className="text-sm font-semibold">Needs your attention</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted-foreground">{attention.map((text) => <li key={text}>{text}</li>)}</ul>
            </div>
          </div>
        </section>
      )}

      {/* 1. BRAND */}
      <Section id="settings-brand" title="Brand" description="How readers recognise the feed.">
        <BrandBasics
          topicId={topic.id}
          name={topic.name}
          colour={topic.illustration_primary_color}
          brandingConfig={topic.branding_config}
          onSaved={(values) => patch(values)}
        />
        <RememberedFold foldKey="brand-more" label="More options: app icon, picture colours, welcome card, About page, voice and tone">
          <div className="space-y-10">
            <section>
              <SubHeading>Logo, icon and picture colours</SubHeading>
              <TopicBrandingSettings key={brandKey} topic={{ id: topic.id, name: topic.name, illustration_primary_color: topic.illustration_primary_color, branding_config: topic.branding_config as never }} onUpdate={onUpdate} />
            </section>
            <section className="border-t border-border pt-8">
              <SubHeading>Welcome card and About page</SubHeading>
              <OnboardingSettings topic={{ id: topic.id, name: topic.name, slug: topic.slug, branding_config: topic.branding_config as never }} onUpdate={onUpdate} />
            </section>
            <section className="border-t border-border pt-8" aria-labelledby="voice-heading">
              <SubHeading id="voice-heading">Voice and tone</SubHeading>
              <ContentVoiceSettings
                topicId={topic.id}
                topicName={topic.name}
                topicType={topic.topic_type}
                region={topic.region}
                currentExpertise={topic.audience_expertise}
                currentTone={topic.default_tone}
                currentWritingStyle={topic.default_writing_style}
                currentHouseStyleNotes={topic.house_style_notes}
                currentHouseStyleExamples={topic.house_style_examples}
                onUpdate={onUpdate}
              />
            </section>
          </div>
        </RememberedFold>
      </Section>

      {/* 2. WHAT WE LOOK FOR */}
      <Section id="settings-look-for" title="What we look for" description="Two plain lists decide what reaches your Desk.">
        <LookForPanel
          topicId={topic.id}
          keywords={topic.keywords}
          negativeKeywords={negativeKeywords}
          setupState={topic.coverage_setup_state || {}}
          onChange={(values) => {
            if (values.negative_keywords) onNegativeKeywordsChange(values.negative_keywords);
            patch(values);
          }}
        />
        <RememberedFold foldKey="lookfor-more" label="More options: how local, categories, picture references">
          <div className="space-y-10">
            {topic.topic_type === "regional" && (
              <section aria-labelledby="news-values-heading">
                <SubHeading id="news-values-heading">How local</SubHeading>
                <NewsValuesPanel
                  topicId={topic.id}
                  region={topic.region}
                  landmarks={topic.landmarks}
                  postcodes={topic.postcodes}
                  organizations={topic.organizations}
                  localityStrength={topic.locality_strength}
                  nearbyPlaces={topic.nearby_places}
                  bigStoryOverride={topic.big_story_override}
                  onChange={(values) => patch(values)}
                />
              </section>
            )}
            <section className="border-t border-border pt-8 first:border-t-0 first:pt-0" aria-labelledby="coverage-categories-heading">
              <SubHeading id="coverage-categories-heading" hint="How published stories are grouped for readers' filters and look-backs.">Categories</SubHeading>
              <CategoriesPanel topicId={topic.id} />
            </section>
            <section className="border-t border-border pt-8" aria-labelledby="picture-references-heading">
              <PictureReferences
                topicId={topic.id}
                topicName={topic.name}
                region={topic.region}
                landmarks={topic.landmarks || []}
                descriptions={topic.landmark_descriptions || {}}
                photos={topic.landmark_reference_images || {}}
                setupState={topic.landmark_setup_state || {}}
                illustrationStyle={topic.illustration_style}
                onIllustrationStyleChange={async (style) => {
                  const previous = topic.illustration_style;
                  patch({ illustration_style: style });
                  const { error } = await supabase
                    .from("topics")
                    .update({ illustration_style: style, updated_at: new Date().toISOString() } as never)
                    .eq("id", topic.id);
                  if (error) {
                    patch({ illustration_style: previous });
                    toast({ title: "Could not save the picture style", description: error.message, variant: "destructive" });
                    return;
                  }
                  toast({ title: "Picture style saved" });
                  onUpdate?.();
                }}
                onChange={(values) => patch(values)}
              />
            </section>
          </div>
        </RememberedFold>
      </Section>

      {/* 3. AUTOPILOT */}
      <Section id="settings-autopilot" title="Autopilot" description="How much happens without you. Per-source Auto-publish lives on each source.">
        <AutopilotBasics key={`ap-${topic.drip_feed_enabled}`} topicId={topic.id} onChanged={onUpdate} />
        <RememberedFold foldKey="autopilot-more" label="More options: exact behaviour, checking frequency, quality bars, release timing">
          <div className="space-y-10">
            <TopicAutomationSettings topicId={topic.id} />
            <section className="border-t border-border pt-8">
              <SubHeading>Release timing</SubHeading>
              <DripFeedSettings topicId={topic.id} onUpdate={onUpdate} />
            </section>
          </div>
        </RememberedFold>
      </Section>

      {/* 4. SHARE AND GROW */}
      <Section id="settings-share" title="Share and grow" description="Ways for readers to follow the feed.">
        <ShareBasics
          topicId={topic.id}
          slug={topic.slug}
          emailEnabled={topic.email_subscriptions_enabled === true}
          weeklyEnabled={topic.weekly_email_enabled !== false}
          widgetEnabled={topic.public_widget_builder_enabled === true}
          subscriberCount={stats.email_subscribers_total || 0}
          onChannelToggle={onChannelToggle}
          onTopicPatch={(values) => patch(values)}
          onProRequired={onProRequired}
        />
        <RememberedFold foldKey="share-more" label={`Advanced: subscribers${FEATURES.emailSegments ? ", email segments" : ""}${FEATURES.audioBriefings ? ", audio briefings" : ""}, widget builder, RSS, AI assistants, donations`}>
          <div className="divide-y divide-border border-y border-border">
            <ChannelRow icon={Globe2} label="Public feed" description={topic.is_public ? "Visible to readers" : "Draft — not yet visible"} checked={topic.is_public} onCheckedChange={(checked) => onChannelToggle("is_public", checked, "Public feed")} />
            {topic.email_subscriptions_enabled && (
              <div className="space-y-8 py-6">
                <NewsletterSignupsManager topicId={topic.id} />
                {FEATURES.emailSegments && <div className="border-t border-border pt-6"><EmailSegmentsManager topicId={topic.id} /></div>}
              </div>
            )}
            {!topic.email_subscriptions_enabled && (
              <div className="flex items-center gap-3 py-5 text-sm text-muted-foreground"><Mail className="h-4 w-4" />The subscriber list appears once email sign-ups are on.</div>
            )}
            {FEATURES.audioBriefings && (
              <>
                <ChannelRow icon={Mic2} label="Daily audio briefing" description="A daily spoken briefing" checked={topic.audio_briefings_daily_enabled || false} onCheckedChange={(checked) => onChannelToggle("audio_briefings_daily_enabled", checked, "Daily audio briefings")} />
                <ChannelRow icon={Mic2} label="Weekly audio review" description="A weekly spoken review" checked={topic.audio_briefings_weekly_enabled || false} onCheckedChange={(checked) => onChannelToggle("audio_briefings_weekly_enabled", checked, "Weekly audio briefings")} />
              </>
            )}
            <ChannelRow icon={Settings2} label="Website widget" description="Embed this feed on another website" checked={topic.public_widget_builder_enabled || false} onCheckedChange={(checked) => onChannelToggle("public_widget_builder_enabled", checked, "Website widget")} />
            {topic.public_widget_builder_enabled && (
              <div className="space-y-4 py-6">
                <Button variant="outline" size="sm" asChild>
                  <Link to={`/feed/${topic.slug}/widget`} target="_blank"><ExternalLink className="mr-2 h-4 w-4" />Open the full widget builder</Link>
                </Button>
                <WidgetAnalytics topicId={topic.id} onNewSiteDetected={(domain) => onToast("Widget now live on a new site", `Your widget is now live on ${domain}`)} />
              </div>
            )}
            <ChannelRow icon={Rss} label="RSS" description="A live feed for reader apps" checked={topic.rss_enabled || false} onCheckedChange={(checked) => onChannelToggle("rss_enabled", checked, "RSS feed")} />
            <div id="ai-assistants-heading">
              <AiAssistantAccess
                topicId={topic.id}
                topicSlug={topic.slug}
                topicName={topic.name}
                enabled={topic.mcp_enabled || false}
                access={topic.mcp_access === "open" ? "open" : "key"}
                onChange={(values) => patch(values)}
                onEnabledChange={(checked) => onChannelToggle("mcp_enabled", checked, "AI assistants")}
              />
            </div>
            <div className="py-7"><TopicDonationSettings topicId={topic.id} donationEnabled={topic.donation_enabled || false} donationConfig={(topic.donation_config as never) || { button_text: "Support this feed", tiers: [] }} onUpdate={onUpdate} /></div>
          </div>
        </RememberedFold>
      </Section>

      {/* 5. EXTRAS — folded, at the bottom */}
      <section id="settings-extras" className="scroll-mt-24 border-t border-border pt-10">
        <RememberedFold
          foldKey="extras"
          variant="section"
          label="Extras"
          description={`In-feed cards, quizzes${FEATURES.sentiment ? ", coverage mood" : ""}${FEATURES.communityDiscussion ? ", community discussion" : ""} and local reporting tools. All off unless you switch them on.`}
        >
          <div className="space-y-10">
            <section><SubHeading>In-feed cards and quizzes</SubHeading><TopicInsightSettings topicId={topic.id} /></section>
            {FEATURES.sentiment && (
              <section className="border-t border-border pt-8"><SubHeading>Coverage mood</SubHeading><SentimentKeywordSettings topicId={topic.id} /></section>
            )}
            {FEATURES.communityDiscussion && (
              <section className="border-t border-border pt-8">
                <SubHeading>Community discussion</SubHeading>
                <p className="-mt-2 mb-5 text-sm text-muted-foreground">Follow what people are saying online without changing the feed's writing voice.</p>
                <CommunityVoiceSettings topicId={topic.id} enabled={topic.community_intelligence_enabled} pulseFrequency={topic.community_pulse_frequency} config={topic.community_config} topicType={topic.topic_type} region={topic.region} onUpdate={onUpdate} />
              </section>
            )}
            {topic.topic_type === "regional" && (
              <section className="border-t border-border pt-8">
                <SubHeading>Local reporting tools</SubHeading>
                <RegionalFeaturesSettings topicId={topic.id} region={topic.region} parliamentaryEnabled={topic.parliamentary_tracking_enabled} onUpdate={onUpdate} />
              </section>
            )}
          </div>
        </RememberedFold>
      </section>
    </div>
  );
}

function ChannelRow({ icon: Icon, label, description, checked, onCheckedChange }: { icon: typeof Mail; label: string; description: string; checked: boolean; onCheckedChange?: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-5 py-5">
      <div className="flex items-center gap-3">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div><Label className="text-sm">{label}</Label><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
