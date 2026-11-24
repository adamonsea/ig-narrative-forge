import { opt } from "@/lib/optionalProps";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { SettingsSearch } from "@/components/settings/SettingsSearch";
import { CalendarDays, ExternalLink, MapPin, Image as ImageIcon, Palette, PenLine, Plane, Settings2, Share2, Sparkles, Target, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { PictureReferences } from "@/components/topics/PictureReferences";
import { AiAssistantAccess } from "@/components/topics/AiAssistantAccess";
import { NewsValuesPanel } from "@/components/topics/NewsValuesPanel";
import { ContentVoiceSettings } from "@/components/ContentVoiceSettings";
import { TopicAutomationSettings } from "@/components/TopicAutomationSettings";
import { DripFeedSettings } from "@/components/DripFeedSettings";
import { TopicDonationSettings } from "@/components/TopicDonationSettings";
import { PeriodReviewPanel } from "@/components/categories/PeriodReviewPanel";
import { OnboardingSettings } from "@/components/onboarding";
import { TopicInsightSettings } from "@/components/TopicInsightSettings";
import { SentimentKeywordSettings } from "@/components/SentimentKeywordSettings";
import { CommunityVoiceSettings } from "@/components/CommunityVoiceSettings";
import { RegionalFeaturesSettings } from "@/components/RegionalFeaturesSettings";
import { NewsletterSignupsManager } from "@/components/NewsletterSignupsManager";
import { EmailSegmentsManager } from "@/components/EmailSegmentsManager";
import { WidgetAnalytics } from "@/components/WidgetAnalytics";
import { cn } from "@/lib/utils";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";
import { resolveSettingsSection, settingsPath, visibleSettingsSections, type SettingsSectionId } from "@/lib/settingsSections";
import { PictureColourSetting } from "@/components/settings/PictureColourSetting";
import { type IllustrationStyle } from "@/lib/constants/illustrationStyles";
import { CategoriesPanel } from "@/components/categories/CategoriesPanel";
import { RememberedFold } from "@/components/settings/RememberedFold";
import { BrandBasics } from "@/components/settings/BrandBasics";
import { LookForPanel } from "@/components/settings/LookForPanel";
import { AutopilotBasics } from "@/components/settings/AutopilotBasics";
import { ShareBasics } from "@/components/settings/ShareBasics";
import { FeedLeadSettings } from "@/components/settings/FeedLeadSettings";
import { EventCaptionsSettings } from "@/components/settings/EventCaptionsSettings";
import { FeedLookEditor } from "@/components/settings/look/FeedLookEditor";
import { PublisherPhotosSetting } from "@/components/settings/PublisherPhotosSetting";
import { FEATURES, READER_ONBOARDING_EXTRAS } from "@/lib/featureFlags";

export interface EditorialTopic {
  id: string;
  name: string;
  slug: string;
  topic_type: "regional" | "keyword";
  keywords: string[];
  region?: string | undefined;
  landmarks?: string[] | undefined;
  landmark_descriptions?: Record<string, string> | undefined;
  landmark_reference_images?: (Record<string, { url: string; credit?: string | undefined }[]>) | undefined;
  landmark_setup_state?: Record<string, any> | undefined;
  coverage_setup_state?: Record<string, any> | undefined;
  postcodes?: string[] | undefined;
  organizations?: string[] | undefined;
  audience_expertise?: "beginner" | "intermediate" | "expert" | undefined;
  default_tone?: "formal" | "conversational" | "engaging" | "satirical" | "rhyming_couplet" | undefined;
  default_writing_style?: "journalistic" | "educational" | "listicle" | "story_driven" | undefined;
  illustration_style?: IllustrationStyle | undefined;
  illustration_primary_color?: string | undefined;
  house_style_notes?: string | null | undefined;
  house_style_examples?: string | null | undefined;
  locality_strength?: number | undefined;
  nearby_places?: unknown | undefined;
  big_story_override?: boolean | undefined;
  community_intelligence_enabled?: boolean | undefined;
  community_pulse_frequency?: number | undefined;
  community_config?: ({ subreddits?: string[] | undefined; last_processed?: string | undefined; processing_frequency_hours?: number | undefined }) | undefined;
  parliamentary_tracking_enabled?: boolean | undefined;
  events_enabled?: boolean | undefined;
  feed_lead?: string | null | undefined;
  event_cards?: string | null | undefined;
  event_currency?: string | null | undefined;
  event_photos_enabled?: boolean | null | undefined;
  story_cover_style?: string | null | undefined;
  use_publisher_photos?: boolean | null | undefined;
  event_source_url?: string | undefined;
  branding_config?: unknown | undefined;
  donation_enabled?: boolean | undefined;
  donation_config?: unknown | undefined;
  drip_feed_enabled?: boolean | undefined;
  public_widget_builder_enabled?: boolean | undefined;
  rss_enabled?: boolean | undefined;
  mcp_enabled?: boolean | undefined;
  mcp_access?: "open" | "key" | undefined;
  email_subscriptions_enabled?: boolean | undefined;
  audio_briefings_daily_enabled?: boolean | undefined;
  audio_briefings_weekly_enabled?: boolean | undefined;
  family_safe?: boolean | undefined;
  weekly_email_enabled?: boolean | undefined;
  is_public: boolean;
}

interface EditorialStats {
  pending_articles: number;
  processing_queue: number;
  ready_stories: number;
  simplified_stories_24h: number;
  email_subscribers_total?: number | undefined;
}

interface EditorialControlCenterProps {
  section?: string | undefined;
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

const SECTION_ICONS: Record<SettingsSectionId, LucideIcon> = {
  general: Settings2, look: Palette, pictures: ImageIcon, coverage: Target, local: MapPin, writing: PenLine,
  events: CalendarDays, autopilot: Plane, share: Share2, extras: Sparkles,
};

function Page({ title, purpose, children }: { title: string; purpose?: string | undefined; children: React.ReactNode }) {
  return (
    <section aria-labelledby="settings-page-title" className="space-y-10">
      <header>
        <h2 id="settings-page-title" className="text-2xl font-semibold">{title}</h2>
        {purpose && <p className="mt-1 text-base text-muted-foreground">{purpose}</p>}
      </header>
      {children}
    </section>
  );
}

function SubHeading({ id, children }: { id?: string | undefined; children: React.ReactNode }) {
  return <h3 id={id} className="mb-4 scroll-mt-24 text-lg font-semibold">{children}</h3>;
}

/**
 * Settings: one page per section, each with its own URL, chosen from a sticky
 * list (desktop) or a swipeable tab row (phone). Detail appears only when its
 * switch is on; at most one Advanced fold per page.
 */
export function EditorialControlCenter({
  section,
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
  const eventsOn = topic.events_enabled === true;
  const regional = topic.topic_type === "regional";
  const current = resolveSettingsSection(section, eventsOn, regional);
  const sections = visibleSettingsSections(eventsOn, regional);
  const navigate = useNavigate();
  const [reveal, setReveal] = useState<string | null>(null);

  // Direct links (#anchor) and search results: wait for the row to render, scroll to it, briefly highlight it.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const read = () => setReveal(decodeURIComponent(window.location.hash.slice(1)) || null);
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, [current]);
  useEffect(() => {
    if (!reveal) return;
    let tries = 0;
    const timer = window.setInterval(() => {
      const el = document.getElementById(reveal);
      if (!el && ++tries < 40) return;
      window.clearInterval(timer);
      if (!el) return;
      const row = el.closest<HTMLElement>("[data-setting-row]") ?? el.closest<HTMLElement>(".py-5") ?? el;
      row.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      row.classList.remove("setting-flash");
      void row.offsetWidth;
      row.classList.add("setting-flash");
      window.setTimeout(() => row.classList.remove("setting-flash"), 2000);
    }, 100);
    return () => window.clearInterval(timer);
  }, [reveal, current]);
  const patch = (values: Partial<EditorialTopic> | Record<string, unknown>) => onTopicChange({ ...topic, ...(values as Partial<EditorialTopic>) });
  const navRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible in the phone tab row.
  useEffect(() => {
    navRef.current?.querySelector<HTMLElement>("[aria-current=page]")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [current]);

  const meta = sections.find((s) => s.id === current) ?? sections[0]!;
  const label = meta.label;
  const purpose = meta.purpose;
  const [eventsSaving, setEventsSaving] = useState<SaveState>(null);
  const toggleEvents = async (on: boolean) => {
    setEventsSaving("saving");
    const { error } = await supabase.from("topics").update({ events_enabled: on, updated_at: new Date().toISOString() } as never).eq("id", topic.id);
    if (error) { setEventsSaving("not-saved"); return; }
    patch({ events_enabled: on });
    setEventsSaving("saved");
  };

  return (
    <div className="mx-auto max-w-6xl md:grid md:grid-cols-[216px_minmax(0,1fr)] md:gap-12">
      <nav aria-label="Settings sections" className="md:sticky md:top-24 md:self-start">
        <SettingsSearch
          visible={sections.map((s) => s.id)}
          onPick={(entry) => {
            navigate(`${settingsPath(topic.slug, entry.section)}#${entry.anchor}`);
            setReveal(null);
            window.setTimeout(() => setReveal(entry.anchor), 0);
          }}
        />
        <div ref={navRef} className="-mx-4 flex snap-x gap-1 overflow-x-auto border-b border-border px-4 pb-2 md:mx-0 md:flex-col md:border-b-0 md:px-0 md:pb-0">
          {sections.map((s) => (
            <Link
              key={s.id}
              to={settingsPath(topic.slug, s.id)}
              aria-current={s.id === current ? "page" : undefined}
              className={cn(
                "flex min-h-11 shrink-0 snap-start items-center whitespace-nowrap rounded-lg px-3 text-base transition-colors",
                s.id === current ? "bg-muted font-semibold text-foreground shadow-[inset_0_-2px_0_hsl(var(--purple-bright))] md:shadow-[inset_2px_0_0_hsl(var(--purple-bright))]" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              {(() => { const Icon = SECTION_ICONS[s.id]; return <Icon aria-hidden className="mr-3 h-4 w-4 shrink-0" />; })()}
              {s.label}
            </Link>
          ))}
        </div>
      </nav>

      <div className="mt-8 max-w-3xl space-y-10 md:mt-0">

        {current === "general" && (
          <Page title={label} purpose={purpose}>
            <BrandBasics topicId={topic.id} name={topic.name} colour={topic.illustration_primary_color} brandingConfig={topic.branding_config} onSaved={(values) => patch(values)} />
            <SettingGroup>
              <SettingRow label="Events" hint={eventsOn ? "Gathering events. Their settings are on the Events page." : "Gather what's on as well as news. Adds an Events page here."}>
                <SaveIndicator state={eventsSaving} />
                <Switch aria-label="Events" checked={eventsOn} onCheckedChange={(on) => void toggleEvents(on)} />
              </SettingRow>
            </SettingGroup>
            <section aria-labelledby="about-heading">
              <OnboardingSettings topic={{ id: topic.id, name: topic.name, slug: topic.slug, branding_config: topic.branding_config as never }} onUpdate={onUpdate} />
            </section>
          </Page>
        )}

        {current === "look" && (
          <Page title={label} purpose={purpose}>
            <FeedLookEditor topicId={topic.id} name={topic.name} colour={topic.illustration_primary_color} brandingConfig={topic.branding_config} coverStyle={topic.story_cover_style} regional={topic.topic_type === "regional"} eventsEnabled={topic.events_enabled} onSaved={(values) => patch(values)} />
          </Page>
        )}

        {current === "pictures" && (
          <Page title={label} purpose={purpose}>
            <SettingGroup>
              <PictureColourSetting topicId={topic.id} brandingConfig={topic.branding_config} onSaved={(values) => patch(values)} />
              <PublisherPhotosSetting topicId={topic.id} value={topic.use_publisher_photos} onSaved={(values) => patch(values)} />
            </SettingGroup>
            <section aria-labelledby="picture-references-heading">
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
                  const { error } = await supabase.from("topics").update({ illustration_style: style, updated_at: new Date().toISOString() } as never).eq("id", topic.id);
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
          </Page>
        )}

        {current === "coverage" && (
          <Page title={label} purpose={purpose}>
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
            <section id="categories" aria-labelledby="coverage-categories-heading" className="scroll-mt-24">
              <SubHeading id="coverage-categories-heading">Categories</SubHeading>
              <CategoriesPanel topicId={topic.id} />
            </section>
          </Page>
        )}

        {current === "local" && regional && (
          <Page title={label} purpose={purpose}>
            <NewsValuesPanel topicId={topic.id} region={topic.region} landmarks={topic.landmarks} postcodes={topic.postcodes} organizations={topic.organizations} localityStrength={topic.locality_strength} nearbyPlaces={topic.nearby_places} bigStoryOverride={topic.big_story_override} onChange={(values) => patch(values)} />
          </Page>
        )}

        {current === "writing" && (
          <Page title={label} purpose={purpose}>
            <div id="voice-heading">
              <ContentVoiceSettings topicId={topic.id} topicName={topic.name} topicType={topic.topic_type} region={topic.region} currentExpertise={topic.audience_expertise} currentTone={topic.default_tone} currentWritingStyle={topic.default_writing_style} currentHouseStyleNotes={topic.house_style_notes} currentHouseStyleExamples={topic.house_style_examples} onUpdate={onUpdate} />
            </div>
          </Page>
        )}

        {current === "events" && eventsOn && (
          <Page title={label} purpose={purpose}>
            <FeedLeadSettings topicId={topic.id} lead={topic.feed_lead} cards={topic.event_cards} currency={topic.event_currency} photos={topic.event_photos_enabled} onSaved={(values) => patch(values)} />
            <EventCaptionsSettings topicId={topic.id} />
          </Page>
        )}

        {current === "autopilot" && (
          <Page title={label} purpose={purpose}>
            <AutopilotBasics key={`ap-${topic.drip_feed_enabled}`} topicId={topic.id} onChanged={onUpdate} />
            <section>
              <SubHeading>Release timing</SubHeading>
              <DripFeedSettings topicId={topic.id} onUpdate={onUpdate} />
            </section>
            <RememberedFold foldKey="autopilot-more" label="Advanced">
              <TopicAutomationSettings topicId={topic.id} />
            </RememberedFold>
          </Page>
        )}

        {current === "share" && (
          <Page title={label} purpose={purpose}>
            <SettingGroup>
              <SettingRow label="Public link" hint={`${typeof window !== "undefined" ? window.location.host : "curatr.pro"}/feed/${topic.slug}`}>
                <Button variant="outline" asChild><Link to={`/feed/${topic.slug}`} target="_blank"><ExternalLink className="mr-2 h-4 w-4" />Open</Link></Button>
              </SettingRow>
            </SettingGroup>
            <ShareBasics
              topicId={topic.id}
              slug={topic.slug}
              emailEnabled={topic.email_subscriptions_enabled === true}
              weeklyEnabled={topic.weekly_email_enabled !== false}
              widgetEnabled={topic.public_widget_builder_enabled === true}
              subscriberCount={stats.email_subscribers_total || 0}
              onChannelToggle={onChannelToggle}
              onTopicPatch={(values) => patch(values)}
              {...opt("onProRequired", onProRequired)}
            />
            {topic.email_subscriptions_enabled && (
              <div className="space-y-8">
                <NewsletterSignupsManager topicId={topic.id} />
                {FEATURES.emailSegments && <EmailSegmentsManager topicId={topic.id} />}
              </div>
            )}
            <SettingGroup>
              {topic.public_widget_builder_enabled && (
                <div className="space-y-4 py-5">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/feed/${topic.slug}/widget`} target="_blank"><ExternalLink className="mr-2 h-4 w-4" />Widget builder</Link>
                  </Button>
                  <WidgetAnalytics topicId={topic.id} onNewSiteDetected={(domain) => onToast("Widget now live on a new site", `Your widget is now live on ${domain}`)} />
                </div>
              )}
              <SettingRow label="RSS" hint="A live feed for reader apps.">
                <Switch aria-label="RSS" checked={topic.rss_enabled || false} onCheckedChange={(checked) => onChannelToggle("rss_enabled", checked, "RSS feed")} />
              </SettingRow>
              {FEATURES.audioBriefings && (
                <>
                  <SettingRow label="Daily audio briefing" hint="A daily spoken briefing.">
                    <Switch aria-label="Daily audio briefing" checked={topic.audio_briefings_daily_enabled || false} onCheckedChange={(checked) => onChannelToggle("audio_briefings_daily_enabled", checked, "Daily audio briefings")} />
                  </SettingRow>
                  <SettingRow label="Weekly audio review" hint="A weekly spoken review.">
                    <Switch aria-label="Weekly audio review" checked={topic.audio_briefings_weekly_enabled || false} onCheckedChange={(checked) => onChannelToggle("audio_briefings_weekly_enabled", checked, "Weekly audio briefings")} />
                  </SettingRow>
                </>
              )}
              <div id="ai-assistants-heading" className="scroll-mt-24">
                <AiAssistantAccess topicId={topic.id} topicSlug={topic.slug} topicName={topic.name} enabled={topic.mcp_enabled || false} access={topic.mcp_access === "open" ? "open" : "key"} onChange={(values) => patch(values)} onEnabledChange={(checked) => onChannelToggle("mcp_enabled", checked, "AI assistants")} />
              </div>
            </SettingGroup>
          </Page>
        )}

        {current === "extras" && (
          <Page title={label} purpose={purpose}>
            <section><SubHeading>Feed cards</SubHeading><TopicInsightSettings topicId={topic.id} /></section>
            <section><SubHeading>Support</SubHeading><TopicDonationSettings topicId={topic.id} donationEnabled={topic.donation_enabled || false} donationConfig={(topic.donation_config as never) || { button_text: "Support this feed", tiers: [] }} onUpdate={onUpdate} /></section>
            <section id="period-reviews" className="scroll-mt-24"><SubHeading>Period reviews</SubHeading><PeriodReviewPanel topicId={topic.id} topicSlug={topic.slug} /></section>
            {FEATURES.sentiment && <section><SubHeading>Coverage mood</SubHeading><SentimentKeywordSettings topicId={topic.id} /></section>}
            {FEATURES.communityDiscussion && (
              <section>
                <SubHeading>Community discussion</SubHeading>
                <CommunityVoiceSettings topicId={topic.id} {...opt("enabled", topic.community_intelligence_enabled)} {...opt("pulseFrequency", topic.community_pulse_frequency)} {...opt("config", topic.community_config)} topicType={topic.topic_type} {...opt("region", topic.region)} onUpdate={onUpdate} />
              </section>
            )}
            {topic.topic_type === "regional" && (
              <section>
                <SubHeading>Local reporting tools</SubHeading>
                <RegionalFeaturesSettings topicId={topic.id} region={topic.region} parliamentaryEnabled={topic.parliamentary_tracking_enabled} onUpdate={onUpdate} />
              </section>
            )}
          </Page>
        )}
      </div>
    </div>
  );
}
