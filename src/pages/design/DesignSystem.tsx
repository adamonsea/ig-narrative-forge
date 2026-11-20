import { opt } from "@/lib/optionalProps";
import { EventCategoryIcon, EVENT_CATEGORY_LABELS, type EventCategory } from "@/components/events/EventCategoryIcon";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";
import { EventCard, EventDateBlock } from "@/components/events/EventCard";
import { useState, type ReactNode } from "react";
import { Link, Navigate } from "@/lib/router-compat";
import { Archive, ArrowLeft, ArrowRight, Eye, Check, RefreshCw, Plus, ChevronDown, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WorkspaceDrawer } from "@/components/workspace/WorkspaceDrawer";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { InfoHint, InlineError, SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { RememberedFold } from "@/components/settings/RememberedFold";
import { PictureEditor } from "@/components/picture-edit/PictureEditor";
import { DeskCard, DeskBadge, MetaLine, PublishSplitButton, ShelfLabel, SpikeButton } from "@/components/topic-pipeline/DeskCard";
import { AutopilotPill } from "@/components/topic-pipeline/PoolGlance";
import { AttentionTag } from "@/components/events/DeskEvents";
import { HEALTH_DOT, HEALTH_FILL, HEALTH_TEXT, SourceFigures } from "@/components/sources/SourceCard";
import { LiveFeedControl } from "@/components/feed/LiveFeedControl";

/**
 * /design — the workspace design system, rendered from the parts the Desk already uses.
 * Admin only and hidden from navigation. Anything new in the workspace is added here first.
 */

const STORIES = [
  { title: "Seafront cycle lane plan goes back to the drawing board", meta: ["Eastbourne Herald", "2h ago"] },
  { title: "Pier reopens its arcade after winter repairs", meta: ["Bournefree", "4h ago"] },
  { title: "Council confirms extra bins for Airshow weekend", meta: ["Eastbourne Borough Council", "Yesterday"] },
];

function Block({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-8 space-y-6 border-t border-border pt-12 first:border-t-0 first:pt-0">
      <h2 id={`${id}-t`} className="text-2xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Spec({ name, children, className }: { name: string; children: ReactNode; className?: string | undefined }) {
  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-sm text-muted-foreground">{name}</p>
      {children}
    </div>
  );
}

const COLOURS: { token: string; cls: string; job: string; ink?: string | undefined }[] = [
  { token: "background / card", cls: "bg-card border border-border", job: "Page and cards" },
  { token: "foreground", cls: "bg-foreground", job: "Navy ink" },
  { token: "primary", cls: "bg-primary", job: "The one primary button" },
  { token: "muted", cls: "bg-muted", job: "Pool panels and supporting areas" },
  { token: "muted-foreground", cls: "bg-muted-foreground", job: "Meta and quiet lines" },
  { token: "border", cls: "bg-border", job: "Hairlines" },
  { token: "mint", cls: "bg-mint", job: "Live now bar and live moments only" },
  { token: "pop", cls: "bg-pop", job: "Healthy dots, icons, positive text" },
  { token: "mint-soft", cls: "bg-mint-soft", job: "Green tint behind content" },
  { token: "attention / attention-soft", cls: "bg-attention-soft border border-attention/50", job: "Needs your OK" },
  { token: "destructive / destructive-soft", cls: "bg-destructive-soft border border-destructive/35", job: "Broken only" },
  { token: "purple-bright", cls: "bg-purple-bright", job: "Selection, navigation, focus. Never a fill" },
];

const TYPE = [
  { name: "Display · 32px Instrument Serif", cls: "font-display text-[2rem] leading-tight", sample: "Eastbourne" },
  { name: "Title · 24px semibold", cls: "text-2xl font-semibold", sample: "Sources" },
  { name: "Heading · 18px semibold", cls: "text-lg font-semibold", sample: "Story pool" },
  { name: "Body · 16px", cls: "text-base", sample: "Pier reopens its arcade after winter repairs" },
  { name: "Small · 14px", cls: "text-sm text-muted-foreground", sample: "Eastbourne Herald · 2h ago" },
];

const SPACING = [4, 8, 12, 16, 24, 32, 48];

function IconAction({ label, children, onClick }: { label: string; children: ReactNode; onClick?: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={label} onClick={onClick}>{children}</Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function LiveBar({ phone }: { phone?: boolean | undefined }) {
  return (
    <div className={cn("flex min-h-10 items-center gap-2 bg-mint px-4 py-2", !phone && "rounded-t-xl")}>
      <span className="live-pulse live-pulse-light h-2.5 w-2.5 shrink-0 rounded-full bg-mint-foreground" aria-hidden="true" />
      <h3 className="text-lg font-semibold text-pop-foreground">Live now</h3>
    </div>
  );
}

function SampleCard({ i, open }: { i: number; open?: () => void }) {
  const s = STORIES[i];
  return (
    <DeskCard
      title={s!.title}
      meta={<MetaLine parts={s!.meta} />}
      {...opt("onOpen", open)}
      actions={<>
        <Button size="sm" variant="ghost">Skip</Button>
        <Button size="sm" variant="outline">Publish</Button>
      </>}
    />
  );
}

/** A drawn sample picture for the Edit picture example (no external files). */
function samplePicture(): Promise<Blob | null> {
  const c = document.createElement("canvas");
  c.width = 1600; c.height = 1000;
  const ctx = c.getContext("2d")!;
  const css = (v: string) => `hsl(${getComputedStyle(document.documentElement).getPropertyValue(v).trim()})`;
  ctx.fillStyle = css("--muted"); ctx.fillRect(0, 0, 1600, 1000);
  ctx.fillStyle = css("--primary"); ctx.beginPath(); ctx.arc(1150, 420, 220, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css("--pop"); ctx.fillRect(150, 600, 600, 260);
  return new Promise((r) => c.toBlob(r, "image/png"));
}

export default function DesignSystem() {
  const { user, userRole, loading, isAdmin } = useAuth();
  const { toast } = useToast();
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [save, setSave] = useState<SaveState>("saved");
  const [flowKey, setFlowKey] = useState(0);
  const [settleKey, setSettleKey] = useState(0);
  const [phoneTab, setPhoneTab] = useState<"pool" | "live" | "events">("live");

  // The role arrives just after sign-in; wait for it so admins aren't bounced to the dashboard
  if (loading || (user && userRole === null)) return <main className="min-h-dvh bg-background p-8"><Skeleton className="h-8 w-48" /></main>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const runSave = () => { setSave("saving"); setTimeout(() => setSave("saved"), 900); };

  return (
    <TooltipProvider delayDuration={200}>
      <main className="min-h-dvh bg-background text-foreground">
        <div className="mx-auto max-w-5xl space-y-12 px-4 py-12 md:px-8">
          <header className="space-y-2">
            <h1 className="font-display text-[2rem] leading-tight">Workspace design system</h1>
            <p className="text-base text-muted-foreground">Everything the curator tool may use. Built from the Desk.</p>
            <nav className="flex flex-wrap gap-x-6 gap-y-1 pt-1 text-base" aria-label="Design comparisons">
              <Link to="/design/event-cards" className="underline underline-offset-4 hover:text-foreground">Event cards: A or B</Link>
              <Link to="/design/story-covers" className="underline underline-offset-4 hover:text-foreground">Story covers: split or full bleed</Link>
            </nav>
          </header>

          <Block id="colour" title="Colour">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {COLOURS.map((c) => (
                <div key={c.token} className="flex items-center gap-3">
                  <span className={cn("h-12 w-12 shrink-0 rounded-lg", c.cls)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{c.token}</p>
                    <p className="text-sm text-muted-foreground">{c.job}</p>
                  </div>
                </div>
              ))}
            </div>
            <Spec name="Three greens, three jobs">
              <div className="overflow-hidden rounded-xl border border-border">
                <LiveBar />
                <div className="space-y-2 bg-mint-soft p-4">
                  <p className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-pop" />In feed this week · <span className="font-medium text-pop">12</span></p>
                </div>
              </div>
            </Spec>
          </Block>

          <Block id="type" title="Type">
            <div className="space-y-6">
              {TYPE.map((t) => (
                <Spec key={t.name} name={t.name}><p className={t.cls}>{t.sample}</p></Spec>
              ))}
            </div>
          </Block>

          <Block id="space" title="Spacing, radius, elevation">
            <Spec name="Spacing · 4 8 12 16 24 32 48">
              <div className="flex flex-wrap items-end gap-6">
                {SPACING.map((px) => (
                  <div key={px} className="space-y-2 text-center">
                    <div className="bg-purple-bright/30" style={{ width: px, height: px }} />
                    <p className="text-sm text-muted-foreground">{px}</p>
                  </div>
                ))}
              </div>
            </Spec>
            <Spec name="Radius · 8 controls · 12 cards · full pills">
              <div className="flex items-center gap-6">
                <div className="h-10 w-24 rounded-lg border border-border bg-card" />
                <div className="h-16 w-24 rounded-xl border border-border bg-card" />
                <div className="h-8 w-20 rounded-full bg-muted" />
              </div>
            </Spec>
            <Spec name="Elevation · flat · card · overlay">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-muted/40 p-4 text-sm">Flat · Story pool</div>
                <div className="rounded-xl border border-border bg-card p-4 text-sm shadow-sm">Card · Live now</div>
                <div className="rounded-xl border border-border bg-popover p-4 text-sm shadow-lg">Overlay · drawer, menu</div>
              </div>
            </Spec>
          </Block>

          <Block id="controls" title="Buttons, pills, health">
            <div className="flex flex-wrap items-center gap-3">
              <Button>Publish</Button>
              <Button variant="outline">Gather</Button>
              <Button variant="ghost">Skip</Button>
              <IconAction label="Gather all now"><RefreshCw className="h-4 w-4" /></IconAction>
            </div>
            <div className="flex items-center">
              <SpikeButton onClick={() => {}} />
              <PublishSplitButton onPublish={() => {}} onPublishWithoutPicture={() => {}} />
            </div>
            <div className="flex items-center">
              <SpikeButton onClick={() => {}} />
              <PublishSplitButton label="Add to queue" withoutPictureLabel="Add to queue without picture" onPublish={() => {}} onPublishWithoutPicture={() => {}} />
            </div>
            <div className="flex flex-wrap items-center gap-8">
              <LiveFeedControl isLive feedName="Eastbourne" feedPath="/feed/eastbourne" onChange={() => {}} />
              <LiveFeedControl isLive={false} feedName="Eastbourne" feedPath="/feed/eastbourne" onChange={() => {}} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <AutopilotPill />
              <AttentionTag>2 to check</AttentionTag>
              <DeskBadge tone="pop">Rising</DeskBadge>
              <DeskBadge>Scheduled</DeskBadge>
              <DeskBadge tone="destructive">Failed</DeskBadge>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {(["healthy", "quiet", "failing", "new"] as const).map((h) => (
                <div key={h} className={cn("rounded-xl border p-3", HEALTH_FILL[h])}>
                  <p className="text-base font-medium">{{ healthy: "Bournefree", quiet: "Sussex Express", failing: "Eastbourne Herald", new: "Towner" }[h]}</p>
                  <p className={cn("mt-1 flex items-center gap-2 text-sm", HEALTH_TEXT[h])}>
                    <span className={cn("h-2 w-2 rounded-full", HEALTH_DOT[h])} />
                    {{ healthy: "Flowing", quiet: "Quiet", failing: "Can't read", new: "New" }[h]}
                  </p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-8">
              <SourceFigures figures={[
                { key: "w", label: "W", tip: "Stories in the feed, last 7 days", value: 19 },
                { key: "m", label: "M", tip: "Stories in the feed, last 30 days", value: 74 },
                { key: "y", label: "Y", tip: "Stories in the feed, last 12 months", value: 612 },
              ]} />
              <SourceFigures figures={[
                { key: "c", label: "C", tip: "Coming up in the feed now", value: 23 },
                { key: "w", label: "W", tip: "Events in the feed, last 7 days", value: 6 },
                { key: "m", label: "M", tip: "Events in the feed, last 30 days", value: 31 },
                { key: "y", label: "Y", tip: "Events in the feed, last 12 months", value: 140 },
              ]} />
            </div>
          </Block>

          <Block id="patterns" title="Patterns">
            <Spec name="Page header">
              <div className="flex items-center justify-between gap-4 rounded-xl border border-border p-4">
                <h3 className="text-2xl font-semibold">Sources</h3>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">12m ago</span>
                  <IconAction label="Gather all now"><RefreshCw className="h-4 w-4" /></IconAction>
                  <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add source</Button>
                </div>
              </div>
            </Spec>
            <div className="grid gap-6 md:grid-cols-2">
              <Spec name="DeskCard · at rest (hover or tap to reveal)"><SampleCard i={0} open={() => setDrawer(true)} /></Spec>
              <Spec name="DeskCard · revealed">
                <DeskCard title={STORIES[1]!.title} meta={<MetaLine parts={STORIES[1]!.meta} />} keepActions
                  actions={<><Button size="sm" variant="ghost">Skip</Button><Button size="sm" variant="outline">Publish</Button></>} />
              </Spec>
            </div>
            <Spec name="Needs your OK · pinned at the top">
              <section className="space-y-2 rounded-xl border border-attention/50 bg-attention-soft p-3">
                <p className="flex items-center gap-2 text-base font-medium"><span className="h-2 w-2 rounded-full bg-attention" />1 event needs your OK</p>
                <div className="flex items-center justify-between gap-3 rounded-lg bg-card p-3">
                  <span className="text-base">Pub quiz · The Lamb · Thu 19 Nov</span>
                  <span className="flex gap-2"><Button size="sm" variant="ghost">Skip</Button><Button size="sm" variant="outline">Publish</Button></span>
                </div>
              </section>
            </Spec>
            <div className="grid gap-6 md:grid-cols-2">
              <Spec name="Side drawer · WorkspaceDrawer, every editing view">
                <Button variant="outline" onClick={() => setDrawer(true)}>Open drawer</Button>
              </Spec>
              <Spec name="RememberedFold">
                <RememberedFold foldKey="design-sample" label="More options">
                  <p className="text-base">Rarely used controls live here.</p>
                </RememberedFold>
              </Spec>
            </div>
            <Spec name="Edit picture · replace or move within the frame (event: square with Card and Poster guides)">
              <div className="max-w-sm">
                <PictureEditor aspect={1} guides={[{ aspect: 2, label: "Card" }, { aspect: 9 / 16, label: "Poster" }]}
                  loadSource={samplePicture} onSave={async () => {}} onCancel={() => {}} />
              </div>
            </Spec>
          </Block>

          <Block id="states" title="States">
            <div className="grid gap-6 md:grid-cols-2">
              <Spec name="Loading · skeletons shaped like the content">
                <div className="flex items-start gap-3 rounded-xl border border-border p-3">
                  <Skeleton className="h-16 w-16 rounded-lg" />
                  <div className="flex-1 space-y-2"><Skeleton className="h-5 w-4/5" /><Skeleton className="h-4 w-1/2" /></div>
                </div>
              </Spec>
              <Spec name="Saving">
                <div className="flex items-center gap-4">
                  <SaveIndicator state={save} />
                  <Button variant="outline" size="sm" onClick={runSave}>Change a setting</Button>
                </div>
              </Spec>
              <Spec name="Success · settles in; toast only when off-screen, 3s">
                <div className="space-y-3">
                  <div key={settleKey} className="settle-in"><SampleCard i={2} /></div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSettleKey((k) => k + 1)}>Publish</Button>
                    <Button variant="ghost" size="sm" onClick={() => toast({ title: "Published", duration: 3000 })}>Show toast</Button>
                  </div>
                </div>
              </Spec>
              <Spec name="Error · one sentence, one fix">
                <InlineError message="Couldn't read this source." actionLabel="Try again" onAction={() => {}} />
              </Spec>
              <Spec name="Empty · one line, one action">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-dashed border-border p-4">
                  <span className="text-base text-muted-foreground">No sources yet.</span>
                  <Button size="sm" variant="outline">Add source</Button>
                </div>
              </Spec>
            </div>
          </Block>

          <Block id="motion" title="Motion">
            <div className="grid gap-6 md:grid-cols-3">
              <Spec name="live-pulse">
                <div className="space-y-3">
                  <div className="overflow-hidden rounded-xl"><LiveBar phone /></div>
                  <div className="flex items-center gap-3">
                    <span className="live-pulse h-3 w-3 rounded-full bg-pop" />
                    <span className="text-sm text-muted-foreground">Elsewhere: pop green, never violet</span>
                  </div>
                </div>
              </Spec>
              <Spec name="flow-draw">
                <button type="button" onClick={() => setFlowKey((k) => k + 1)} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label="Replay flow-draw">
                  <svg key={flowKey} width="200" height="40" viewBox="0 0 200 40" aria-hidden="true" className="text-pop">
                    <path className="flow-draw" d="M4 20 H184 M172 10 L188 20 L172 30" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <p className="text-sm text-muted-foreground">Into Live now. Tap to replay.</p>
              </Spec>
              <Spec name="settle-in">
                <div key={`s${settleKey}`} className="settle-in rounded-xl border border-border bg-card p-3 text-base">New arrival</div>
                <Button variant="ghost" size="sm" onClick={() => setSettleKey((k) => k + 1)}>Replay</Button>
              </Spec>
              <Spec name="flow-out · skip-out">
                <div className="space-y-2">
                  <div key={`fo${settleKey}`} className="flow-out rounded-xl border border-border bg-card p-3 text-base">Published: toward Live now</div>
                  <div key={`so${settleKey}`} className="skip-out rounded-xl border border-border bg-card p-3 text-base">Skipped: fades away</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSettleKey((k) => k + 1)}>Replay</Button>
              </Spec>
            </div>
            <Spec name="Desk flow · pools feed Live now">
              <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2">
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-base font-semibold">Story pool</div>
                <ArrowRight className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                <div className="overflow-hidden rounded-xl border bg-mint-soft shadow-sm"><LiveBar /></div>
                <ArrowLeft className="h-4 w-4 text-muted-foreground/70" aria-hidden="true" />
                <div className="rounded-xl border border-border/60 bg-muted/40 p-3 text-base font-semibold">Event pool</div>
              </div>
            </Spec>
            <Spec name="Story pool shelves · needs your OK, Queued, Awaiting review (each card tagged with why Autopilot left it)" className="w-full max-w-md">
              <div className="space-y-2">
                <div className="rounded-xl border border-attention/50 bg-attention-soft p-3 text-base font-semibold text-attention-foreground">1 story needs your OK</div>
                <p className="flex items-center gap-2 py-1 text-sm font-medium text-muted-foreground"><ChevronDown className="h-4 w-4" aria-hidden="true" />Queued · 1</p>
                <ShelfLabel tool={<Button size="icon" variant="ghost" className="h-9 w-9" aria-label="Awaiting review tools"><MoreHorizontal className="h-4 w-4" /></Button>}>Awaiting review · 2</ShelfLabel>
                <div className="flex flex-wrap gap-2"><DeskBadge>No place named</DeskBadge><DeskBadge>73% · needs 75%</DeskBadge></div>
              </div>
            </Spec>
          </Block>

          <Block id="events" title="Event categories">
            <Spec name="Icons · static on the Desk; animated only for the reader card in view; accent = feed colour">
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-7">
                {(Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[]).map((c) => (
                  <div key={c} className="flex flex-col items-center gap-2 text-center text-sm text-muted-foreground">
                    <EventCategoryIcon category={c} animate className="h-12 w-12 text-foreground" />
                    {EVENT_CATEGORY_LABELS[c]}
                  </div>
                ))}
              </div>
            </Spec>
            <Spec name="Illustrations · top band of the reader event card, in the feed colour; animated only for the card in view">
              <div className="grid w-full grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
                {(Object.keys(EVENT_CATEGORY_LABELS) as EventCategory[]).map((c) => (
                  <div key={c} className="space-y-2 text-sm text-muted-foreground">
                    <div className="h-24 overflow-hidden rounded-lg"><EventCategoryIllustration category={c} color="#0E7C7B" /></div>
                    {EVENT_CATEGORY_LABELS[c]}
                  </div>
                ))}
              </div>
            </Spec>
            <Spec name="With a feed colour as accent">
              <div className="flex gap-4">
                {(["music", "film", "markets"] as EventCategory[]).map((c) => <EventCategoryIcon key={c} category={c} accent="#E4572E" className="h-12 w-12 text-foreground" />)}
              </div>
            </Spec>
            <Spec name="Reader date block · sentence case">
              <EventDateBlock ymd="2026-11-19" />
            </Spec>
            <Spec name="Individual event card · two slides; price only when the source says it" className="w-full max-w-md">
              <EventCard brandColor="#0E7C7B" event={{ id: "demo", title: "Fado by the river", start_date: "2026-11-19", start_time: "21:00:00", location: "Clube de Fado, Alfama", source_url: "https://example.com", source_name: "Agenda LX", event_type: "music", price: "15", is_free: false, description: "An evening of traditional fado in a small Alfama tavern." }} currency="EUR" isOwner />
            </Spec>
          </Block>

          <Block id="phone" title="Phone">
            <div className="flex flex-wrap gap-8">
              <Spec name="Tabs · one area at a time, opening on Live now" className="w-full max-w-[360px]">
                <div className="w-full max-w-[360px] space-y-3 rounded-xl border border-border bg-background p-4 shadow-sm">
                  <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted p-1" role="tablist" aria-label="Desk areas">
                    {([["pool", "Story pool", 3], ["live", "Live now", 0], ["events", "Event pool", 1]] as const).map(([k, label, n]) => (
                      <button key={k} type="button" role="tab" aria-selected={phoneTab === k} onClick={() => setPhoneTab(k)}
                        className={cn("rounded-lg px-2 py-2 text-sm font-medium transition-colors", phoneTab === k ? "bg-background text-foreground shadow-sm" : "text-muted-foreground")}>
                        {label}{n ? <span className="ml-1 tabular-nums text-muted-foreground">{n}</span> : null}
                      </button>
                    ))}
                  </div>
                  {phoneTab === "live" && <div className="overflow-hidden rounded-xl bg-mint-soft"><LiveBar phone /><div className="space-y-2 p-2"><SampleCard i={1} open={() => setSheet(true)} /><SampleCard i={2} open={() => setSheet(true)} /></div></div>}
                  {phoneTab === "pool" && <div className="space-y-2"><SampleCard i={0} open={() => setSheet(true)} /><SampleCard i={1} open={() => setSheet(true)} /></div>}
                  {phoneTab === "events" && <AttentionTag>1 to check</AttentionTag>}
                </div>
              </Spec>
              <Spec name="Bottom sheet · the drawer on phones">
                <Button variant="outline" onClick={() => setSheet(true)}>Open bottom sheet</Button>
              </Spec>
            </div>
          </Block>
        </div>

        <WorkspaceDrawer
          open={drawer}
          onOpenChange={setDrawer}
          title={STORIES[0]!.title}
          description="Eastbourne Herald · 2h ago"
          footer={
            <div className="flex w-full justify-between gap-2">
              <IconAction label="Archive"><Archive className="h-4 w-4" /></IconAction>
              <span className="flex gap-2"><Button variant="ghost">Skip</Button><Button><Check className="mr-1 h-4 w-4" />Publish</Button></span>
            </div>
          }
        >
          <p className="text-base">Plans for a segregated cycle lane along Royal Parade will be redrawn after the consultation.</p>
          <div className="flex items-center gap-2"><span className="text-sm font-medium">Tone</span><InfoHint label="About tone">How the story reads.</InfoHint></div>
        </WorkspaceDrawer>
        <Sheet open={sheet} onOpenChange={setSheet}>
          <SheetContent side="bottom" className="max-h-[85dvh] space-y-4 overflow-y-auto rounded-t-xl">
            <SheetHeader>
              <SheetTitle className="text-lg font-semibold">{STORIES[1]!.title}</SheetTitle>
              <SheetDescription className="text-sm">Bournefree · 4h ago</SheetDescription>
            </SheetHeader>
            <div className="flex gap-2">
              <Button variant="outline" className="h-11 flex-1"><Eye className="mr-1 h-4 w-4" />View</Button>
              <Button className="h-11 flex-1">Publish</Button>
            </div>
          </SheetContent>
        </Sheet>
      </main>
    </TooltipProvider>
  );
}
