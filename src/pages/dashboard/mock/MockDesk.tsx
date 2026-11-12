import { useMemo, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarDays, Check, ChevronDown, ExternalLink, Loader2, Mail, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import {
  badge, coverSentence, detectSourceKind, sourceById, timeLabel, upcomingWhatsOn, SOURCE_KIND_LABEL,
  type MockEvent, type MockSource, type MockState, type MockStory, type WaitingItem,
} from "./eventsDeskRules";
import { feedSequence, MOCK_FEED_NAME } from "./MockFeed";

type Update = (fn: (prev: MockState) => MockState) => void;

const ago = (m: number) => (m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`);

function TypeChip({ type }: { type: "story" | "event" }) {
  return type === "event" ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"><CalendarDays className="h-3 w-3" aria-hidden="true" />Event</span>
  ) : (
    <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">Story</span>
  );
}

function MiniDate({ date }: { date: string }) {
  const b = badge(date);
  return (
    <div className="w-11 shrink-0 rounded-lg border border-border py-1 text-center leading-none" aria-hidden="true">
      <div className="text-[10px] font-semibold tracking-wider text-muted-foreground">{b.weekday}</div>
      <div className="mt-0.5 text-lg font-bold">{b.day}</div>
    </div>
  );
}

// ---------- Waiting ----------

function WaitingStory({ item, state, onApprove, onDiscard, busy }: {
  item: Extract<WaitingItem, { type: "story" }>; state: MockState; busy: boolean;
  onApprove: () => void; onDiscard: (block: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const source = sourceById(state, item.story.sourceId);
  return (
    <li className="py-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2"><TypeChip type="story" /><span className="text-sm text-muted-foreground">{source?.name} · {ago(item.minsAgo)}</span></div>
          <p className="mt-1.5 text-lg font-medium leading-snug">{item.story.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
            More<ChevronDown className={`ml-1 h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => onDiscard(false)} disabled={busy}>Discard</Button>
          <Button size="sm" onClick={onApprove} disabled={busy} className="min-w-[96px]">
            {busy ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />Writing</> : "Approve"}
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-3 space-y-3 rounded-xl bg-muted/50 p-4">
          <div className="space-y-1.5 text-sm leading-relaxed">{item.story.slides.map((s) => <p key={s}>{s}</p>)}</div>
          <div className="flex flex-wrap gap-2">
            {[
              { v: "short", items: [["short", "4 slides"], ["tabloid", "6 slides"], ["indepth", "8 slides"]] },
              { v: "conversational", items: [["formal", "Formal"], ["conversational", "Conversational"], ["engaging", "Engaging"]] },
              { v: "journalistic", items: [["journalistic", "Journalistic"], ["educational", "Educational"], ["story_driven", "Story-driven"]] },
            ].map((s) => (
              <Select key={s.v} defaultValue={s.v}>
                <SelectTrigger className="h-8 w-auto gap-2 bg-background text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>{s.items.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
              </Select>
            ))}
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <a href={source?.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />Original</a>
            <button type="button" onClick={() => onDiscard(true)} className="text-muted-foreground hover:text-destructive">Discard and never fetch again</button>
          </div>
        </div>
      )}
    </li>
  );
}

function WaitingEvent({ item, onPublish, onSkip }: { item: Extract<WaitingItem, { type: "event" }>; onPublish: () => void; onSkip: () => void }) {
  const e = item.event;
  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <MiniDate date={e.date} />
        <div className="min-w-0">
          <div className="flex items-center gap-2"><TypeChip type="event" /><span className="text-sm text-muted-foreground">{e.sourceName} · {ago(item.minsAgo)}</span></div>
          <p className="mt-1.5 text-lg font-medium leading-snug">{e.title}</p>
          <p className="text-sm text-muted-foreground">{[timeLabel(e.time), e.venue].filter(Boolean).join(" · ")}</p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onSkip}>Skip</Button>
        <Button size="sm" onClick={onPublish} className="min-w-[96px]">Publish</Button>
      </div>
    </li>
  );
}

// ---------- Live ----------

function LiveStoryRow({ story, n, state, first, last, onMove, onRemove }: {
  story: MockStory; n: number; state: MockState; first: boolean; last: boolean;
  onMove: (dir: -1 | 1) => void; onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3">
      <span className="w-5 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{n}</span>
      {story.image ? (
        <img src={story.image} alt="" width={48} height={48} loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="h-12 w-12 shrink-0 rounded-lg bg-muted" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{story.title}</p>
        <p className="truncate text-sm text-muted-foreground">{sourceById(state, story.sourceId)?.name}</p>
      </div>
      <div className="flex shrink-0 items-center">
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={first} onClick={() => onMove(-1)} aria-label={`Move “${story.title}” up`}><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" disabled={last} onClick={() => onMove(1)} aria-label={`Move “${story.title}” down`}><ArrowDown className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRemove} aria-label={`Remove “${story.title}” from the feed`}><X className="h-4 w-4" /></Button>
      </div>
    </li>
  );
}

function LiveWhatsOn({ events, today, onRemove }: { events: MockEvent[]; today: string; onRemove: (e: MockEvent) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <div className="rounded-xl border border-primary/30 bg-primary/5">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 p-3 text-left">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"><CalendarDays className="h-5 w-5" aria-hidden="true" /></div>
          <div className="min-w-0 flex-1">
            <p className="font-medium">What's on · {events.length} {events.length === 1 ? "event" : "events"}</p>
            <p className="truncate text-sm text-muted-foreground">{coverSentence(events, today)}</p>
          </div>
          <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        {open && (
          <ul className="divide-y divide-border border-t border-primary/20 px-3">
            {events.map((e) => (
              <li key={e.id} className="flex items-center gap-3 py-2.5">
                <MiniDate date={e.date} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{e.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{[timeLabel(e.time), e.venue].filter(Boolean).join(" · ")}</p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onRemove(e)} aria-label={`Remove “${e.title}”`}><X className="h-4 w-4" /></Button>
              </li>
            ))}
            <li className="py-2.5 text-xs text-muted-foreground">Past events drop off on their own.</li>
          </ul>
        )}
      </div>
    </li>
  );
}

// ---------- Sources ----------

function SourcesView({ state, update, onBack }: { state: MockState; update: Update; onBack: () => void }) {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const valid = /^(https?:\/\/|webcal:\/\/)?[^\s/]+\.[^\s]+/.test(url.trim());
  const kind = valid ? detectSourceKind(url) : null;

  const add = () => {
    if (!kind) return;
    let host = url.trim();
    try { host = new URL(/^\w+:\/\//.test(host) ? host : `https://${host}`).hostname.replace(/^www\./, ""); } catch { /* keep text */ }
    update((s) => ({ ...s, sources: [{ id: `src-${Date.now()}`, name: host, url: url.trim(), kind, autoPublish: false }, ...s.sources] }));
    setUrl("");
    toast({ title: "Source added", description: `${SOURCE_KIND_LABEL[kind]} · new items will wait for you` });
  };

  const toggle = (src: MockSource, on: boolean) => {
    let moved = 0;
    update((s) => {
      const fromSrc = (w: WaitingItem) => (w.type === "story" ? w.story.sourceId : w.sourceId) === src.id;
      const going = on ? s.waiting.filter(fromSrc) : [];
      moved = going.length;
      return {
        ...s,
        sources: s.sources.map((x) => (x.id === src.id ? { ...x, autoPublish: on } : x)),
        waiting: on ? s.waiting.filter((w) => !fromSrc(w)) : s.waiting,
        live: [...going.flatMap((w) => (w.type === "story" ? [w.story] : [])), ...s.live],
        liveEvents: [...s.liveEvents, ...going.flatMap((w) => (w.type === "event" ? [w.event] : []))],
      };
    });
    setTimeout(() => {
      if (on && moved) toast({ title: `${moved} waiting from ${src.name} went Live` });
    }, 0);
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to the Desk"><ArrowLeft className="h-5 w-5" /></Button>
        <h1 className="font-lexend text-3xl font-semibold tracking-tight">Sources</h1>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); add(); }} className="space-y-2">
        <div className="flex gap-2">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="Paste a link" aria-label="Paste a source link" className="h-12 text-base" />
          <Button type="submit" disabled={!kind} className="h-12 px-6">Add</Button>
        </div>
        <p className="h-5 text-sm text-muted-foreground" aria-live="polite">{kind ? `Looks like ${/^[aeiou]/i.test(SOURCE_KIND_LABEL[kind]) ? "an" : "a"} ${SOURCE_KIND_LABEL[kind]}` : ""}</p>
      </form>

      <div>
        <div className="flex items-end justify-between border-b border-border pb-2 text-sm text-muted-foreground">
          <span>{state.sources.length} sources</span>
          <span>Auto-publish</span>
        </div>
        <ul className="divide-y divide-border">
          {state.sources.map((src) => (
            <li key={src.id} className="flex items-center gap-3 py-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground" aria-hidden="true">{src.name.charAt(0).toUpperCase()}</div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{src.name}</p>
                <p className="truncate text-sm text-muted-foreground">{SOURCE_KIND_LABEL[src.kind]}</p>
              </div>
              <Switch checked={src.autoPublish} onCheckedChange={(on) => toggle(src, on)} aria-label={`Auto-publish from ${src.name}`} />
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-muted-foreground">On: straight to Live. Off: waits for you.</p>
      </div>
    </div>
  );
}

// ---------- The Desk ----------

export function MockDesk({ state, update, onViewFeed }: { state: MockState; update: Update; onViewFeed: () => void }) {
  const { toast } = useToast();
  const [view, setView] = useState<"desk" | "sources">("desk");
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const waiting = useMemo(() => [...state.waiting].sort((a, b) => a.minsAgo - b.minsAgo), [state.waiting]);
  const events = useMemo(() => upcomingWhatsOn(state.liveEvents, state.today), [state.liveEvents, state.today]);
  const { signup, whatsOn } = feedSequence(state);

  const undoable = (title: string, apply: (s: MockState) => MockState) => {
    let before: MockState | null = null;
    update((s) => { before = s; return apply(s); });
    toast({ title, action: <ToastAction altText="Undo" onClick={() => before && update(() => before!)}>Undo</ToastAction> });
  };

  const dropWaiting = (id: string) => (s: MockState) => ({ ...s, waiting: s.waiting.filter((w) => w.id !== id) });

  const approve = (item: Extract<WaitingItem, { type: "story" }>) => {
    setBusy((b) => new Set(b).add(item.id));
    setTimeout(() => {
      update((s) => ({ ...dropWaiting(item.id)(s), live: [item.story, ...s.live] }));
      setBusy((b) => { const n = new Set(b); n.delete(item.id); return n; });
      toast({ title: "Live", description: "First in the feed." });
    }, 1400);
  };

  const move = (i: number, dir: -1 | 1) => update((s) => {
    const live = [...s.live];
    const j = i + dir;
    if (j < 0 || j >= live.length) return s;
    [live[i], live[j]] = [live[j], live[i]];
    return { ...s, live };
  });

  if (view === "sources") return <SourcesView state={state} update={update} onBack={() => setView("desk")} />;

  return (
    <div className="space-y-10">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary font-lexend text-lg font-bold text-primary-foreground" aria-hidden="true">E</div>
          <h1 className="font-lexend text-3xl font-semibold tracking-tight">{MOCK_FEED_NAME}</h1>
        </div>
        <nav className="flex items-center gap-1">
          <Button variant="ghost" onClick={() => setView("sources")}>Sources</Button>
          <Button variant="ghost" onClick={onViewFeed}>View feed</Button>
        </nav>
      </header>

      <section aria-labelledby="waiting-h">
        <h2 id="waiting-h" className="flex items-baseline gap-2 font-lexend text-xl font-semibold">
          Waiting {waiting.length > 0 && <span className="text-base font-normal text-muted-foreground">{waiting.length}</span>}
        </h2>
        {waiting.length === 0 ? (
          <p className="mt-3 flex items-center gap-2 text-muted-foreground"><Check className="h-4 w-4 text-success" aria-hidden="true" />All caught up</p>
        ) : (
          <ul className="mt-1 divide-y divide-border">
            {waiting.map((item) => item.type === "story" ? (
              <WaitingStory key={item.id} item={item} state={state} busy={busy.has(item.id)}
                onApprove={() => approve(item)}
                onDiscard={(block) => undoable(block ? "Discarded, won't come back" : "Discarded", dropWaiting(item.id))} />
            ) : (
              <WaitingEvent key={item.id} item={item}
                onPublish={() => undoable("Added to What's on", (s) => ({ ...dropWaiting(item.id)(s), liveEvents: [...s.liveEvents, item.event] }))}
                onSkip={() => undoable("Skipped", dropWaiting(item.id))} />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="live-h">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="live-h" className="font-lexend text-xl font-semibold">Live</h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground"><Mail className="h-3.5 w-3.5" aria-hidden="true" />The weekly email takes what's here</p>
        </div>
        <ul className="mt-1 divide-y divide-border">
          {state.live.map((story, i) => {
            const n = i + 1;
            return [
              <LiveStoryRow key={story.id} story={story} n={n} state={state} first={i === 0} last={i === state.live.length - 1}
                onMove={(d) => move(i, d)}
                onRemove={() => undoable("Removed from the feed", (s) => ({ ...s, live: s.live.filter((x) => x.id !== story.id) }))} />,
              signup.includes(n) ? <li key={`su-${n}`} className="py-2.5 pl-8 text-sm text-muted-foreground">Email sign-up card</li> : null,
              whatsOn.includes(n) && events.length > 0 ? (
                <LiveWhatsOn key={`wo-${n}`} events={events} today={state.today}
                  onRemove={(e) => undoable(`Removed “${e.title}”`, (s) => ({ ...s, liveEvents: s.liveEvents.filter((x) => x.id !== e.id) }))} />
              ) : null,
            ];
          })}
        </ul>
      </section>
    </div>
  );
}
