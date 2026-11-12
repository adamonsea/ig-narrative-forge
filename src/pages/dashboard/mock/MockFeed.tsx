import { useMemo, useState } from "react";
import { ArrowUpRight, CalendarDays, ExternalLink, MessageCircle, Share2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmblaSlideCarousel } from "@/components/ui/embla-slide-carousel";
import { feedBrandPalette, feedBrandSurface, toCss } from "@/lib/feedBrandColor";
import {
  badge, coverLines, eventGroup, signupPositions, sourceById, timeLabel, upcomingWhatsOn, whatsOnPositions,
  WHATS_ON_MIN_GAP, type MockEvent, type MockState, type MockStory,
} from "./eventsDeskRules";

export const MOCK_FEED_NAME = "Eastbourne";
export const MOCK_BRAND = "#ec4899";

function brandVars(color: string) {
  const p = feedBrandPalette(color);
  return {
    "--ev-fill": toCss(p.light.fill), "--ev-on-fill": toCss(p.light.onFill), "--ev-accent": toCss(p.light.text),
    "--ev-fill-dark": toCss(p.dark.fill), "--ev-on-fill-dark": toCss(p.dark.onFill), "--ev-accent-dark": toCss(p.dark.text),
  } as React.CSSProperties;
}
const FILL = "bg-[color:var(--ev-fill)] text-[color:var(--ev-on-fill)] dark:bg-[color:var(--ev-fill-dark)] dark:text-[color:var(--ev-on-fill-dark)]";
const ACCENT = "text-[color:var(--ev-accent)] dark:text-[color:var(--ev-accent-dark)]";

/** Bottom row shared by both card types: one pill, then the usual share buttons. */
function CardFooter({ pill }: { pill: React.ReactNode }) {
  return (
    <div className="p-4">
      <div className="mb-4 flex min-h-9 justify-center">{pill}</div>
      <div className="flex justify-center gap-3" aria-hidden="true">
        <Button variant="outline" size="sm" tabIndex={-1} className="text-muted-foreground"><MessageCircle className="h-4 w-4" /></Button>
        <Button variant="outline" size="sm" tabIndex={-1} className="gap-2 text-muted-foreground"><Share2 className="h-4 w-4" />Share</Button>
      </div>
    </div>
  );
}

const brandPill = `inline-flex items-center gap-1.5 min-h-9 px-4 py-1.5 text-[13px] sm:text-sm font-semibold whitespace-nowrap rounded-full transition-opacity hover:opacity-90 ${FILL}`;

// ---------- story card (look-alike of the real feed card, dummy content) ----------

export function MockStoryCard({ story, state, minsAgo }: { story: MockStory; state: MockState; minsAgo: number }) {
  const [slide, setSlide] = useState(0);
  const source = sourceById(state, story.sourceId)?.name ?? "source";
  const all = [story.title, ...story.slides];
  const last = slide === all.length - 1;
  const ago = minsAgo < 60 ? `${minsAgo}m` : minsAgo < 1440 ? `${Math.round(minsAgo / 60)}h` : `${Math.round(minsAgo / 1440)}d`;

  const slides = all.map((text, i) =>
    i === 0 ? (
      <div key={i} className="flex h-full flex-col">
        {story.image && (
          <div className="relative h-80 w-full overflow-hidden md:h-96">
            <img src={story.image} alt="" width={800} height={600} loading="lazy" className="h-full w-full object-cover" />
          </div>
        )}
        <div className="flex flex-1 items-center px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
          <h3 className={`mx-auto w-full max-w-xl font-lexend font-semibold uppercase leading-[1.08] text-pretty ${text.length < 50 ? "text-[2.5rem] md:text-6xl" : "text-4xl md:text-5xl"}`}>{text}</h3>
        </div>
      </div>
    ) : (
      <div key={i} className="flex h-full items-center px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-xl font-lexend text-[30px] leading-[1.25] md:text-[40px]">
          <p>{text}</p>
          {i === all.length - 1 && story.author && <p className="mt-[0.9em] text-[0.6em] font-medium opacity-75">By {story.author}</p>}
        </div>
      </div>
    ),
  );

  return (
    <Card className="feed-card w-full overflow-hidden shadow-lg" style={brandVars(MOCK_BRAND)}>
      <div className="relative flex min-h-[600px] flex-col">
        <div className="feed-card-header border-b p-4">
          <span className="text-xs text-muted-foreground">{ago} ago</span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <EmblaSlideCarousel slides={slides} height="100%" showDots={slides.length > 1} dotStyle="instagram" onSlideChange={setSlide} ariaLabel={`${story.title} story slides`} />
        </div>
        <CardFooter
          pill={last ? (
            <span className={brandPill}><ExternalLink className="h-3.5 w-3.5" />Read the full story at {source}</span>
          ) : (
            <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground"><ExternalLink className="h-3 w-3" />from {source}</span>
          )}
        />
      </div>
    </Card>
  );
}

// ---------- What's on card: a cover, then one event per slide ----------

export function MockWhatsOnCard({ events, today }: { events: MockEvent[]; today: string }) {
  const [slide, setSlide] = useState(0);
  if (!events.length) return null;
  const { lines, more } = coverLines(events, today);
  const current = slide > 0 ? events[slide - 1] : null;

  const cover = (
    <div key="cover" className="flex h-full flex-col">
      <div className={`relative flex h-64 w-full items-center justify-center overflow-hidden md:h-80 ${FILL}`} aria-hidden="true">
        {events.slice(0, 3).map((e, i) => {
          const b = badge(e.date);
          const rot = [-9, 2, 11][i];
          const x = [-88, 0, 88][i];
          return (
            <div key={e.id} className="absolute w-[104px] rounded-2xl bg-[hsl(var(--feed-card))] py-3 text-center font-lexend leading-none text-[hsl(var(--feed-card-foreground))] shadow-xl"
              style={{ transform: `translateX(${x}px) rotate(${rot}deg)`, zIndex: 3 - Math.abs(i - 1) }}>
              <div className={`text-xs font-semibold tracking-[0.1em] ${ACCENT}`}>{b.weekday}</div>
              <div className="my-1 text-5xl font-bold">{b.day}</div>
              <div className="text-xs font-semibold tracking-[0.1em] opacity-70">{b.month}</div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-1 items-center px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-xl">
          <h3 className="font-lexend text-[2.5rem] font-semibold uppercase leading-[1.04] md:text-6xl">What's on</h3>
          <ul className="mt-4 space-y-1.5 font-lexend text-xl leading-snug md:text-2xl">
            {lines.map((l) => (
              <li key={l.title}><span className={`font-semibold ${ACCENT}`}>{l.day}</span> {l.title}</li>
            ))}
            {more > 0 && <li className="opacity-70">+ {more} more</li>}
          </ul>
        </div>
      </div>
    </div>
  );

  const slides = [cover, ...events.map((e) => {
    const b = badge(e.date);
    const meta = [timeLabel(e.time), e.venue].filter(Boolean).join(" · ");
    return (
      <div key={e.id} className="flex h-full items-center px-5 pb-14 pt-6 md:px-8 md:pb-16 md:pt-8">
        <div className="mx-auto w-full max-w-xl">
          <p className={`text-sm font-semibold uppercase tracking-[0.14em] ${ACCENT}`}>{eventGroup(e, today)}</p>
          <div className={`mt-5 w-[104px] rounded-2xl py-3 text-center font-lexend leading-none ${FILL}`} aria-hidden="true">
            <div className="text-xs font-semibold tracking-[0.1em]">{b.weekday}</div>
            <div className="my-1 text-5xl font-bold">{b.day}</div>
            <div className="text-xs font-semibold tracking-[0.1em]">{b.month}</div>
          </div>
          <h3 className="mt-6 font-lexend text-4xl font-semibold leading-[1.08] text-pretty md:text-5xl">
            <span className="sr-only">{`${b.weekday} ${b.day} ${b.month}: `}</span>{e.title}
          </h3>
          {meta && <p className="mt-4 text-lg opacity-75 md:text-xl">{meta}</p>}
        </div>
      </div>
    );
  })];

  return (
    <Card className="feed-card w-full overflow-hidden shadow-lg" style={brandVars(MOCK_BRAND)} aria-label="What's on">
      <div className="relative flex min-h-[600px] flex-col">
        <div className="feed-card-header flex items-center justify-between border-b p-4">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${ACCENT}`}><CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />What's on</span>
          <span className="text-xs text-muted-foreground">Next 2 weeks</span>
        </div>
        <div className="relative flex-1 overflow-hidden">
          <EmblaSlideCarousel slides={slides} height="100%" showDots dotStyle="instagram" onSlideChange={setSlide} ariaLabel="What's on: events" />
        </div>
        <CardFooter
          pill={current ? (
            <a href={current.sourceUrl} target="_blank" rel="noopener noreferrer" className={brandPill}>
              More at {current.sourceName}<ArrowUpRight className="h-4 w-4" aria-hidden="true" /><span className="sr-only">(opens in a new tab)</span>
            </a>
          ) : (
            <span className="inline-flex min-h-9 items-center rounded-full bg-muted px-3 py-1.5 text-xs text-muted-foreground">Swipe for {events.length} events</span>
          )}
        />
      </div>
    </Card>
  );
}

// ---------- email sign-up look-alike (static, never submits) ----------

function MockSignupCard() {
  const s = feedBrandSurface(MOCK_BRAND).light;
  return (
    <div className="w-full rounded-xl border p-6 shadow-lg" style={{ background: toCss(s.surface), color: toCss(s.text), borderColor: toCss(s.border) }}>
      <p className="font-lexend text-2xl font-semibold leading-tight">Get {MOCK_FEED_NAME} in your inbox</p>
      <p className="mt-1.5 text-base" style={{ color: toCss(s.muted) }}>The week's stories, every Friday.</p>
      <div className="mt-4 flex gap-2">
        <div className="h-11 flex-1 rounded-lg border" style={{ background: toCss(s.field), borderColor: toCss(s.border) }} />
        <span className="flex h-11 items-center rounded-lg px-4 text-sm font-semibold" style={{ background: toCss(s.fill), color: toCss(s.onFill) }}>Sign up</span>
      </div>
    </div>
  );
}

// ---------- the feed ----------

function Note({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed border-primary/50 px-3 py-2 text-center text-xs text-primary">{children}</p>;
}

/** Live stories in feed order, with the sign-up card and the What's on card placed by the rules. */
export function feedSequence(state: MockState) {
  const signup = signupPositions(state.live.length);
  const whatsOn = whatsOnPositions(state.live.length, signup);
  return { signup, whatsOn };
}

export function MockFeed({ state, notes = false }: { state: MockState; notes?: boolean }) {
  const events = useMemo(() => upcomingWhatsOn(state.liveEvents, state.today), [state.liveEvents, state.today]);
  const { signup, whatsOn } = feedSequence(state);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      {state.live.map((story, i) => {
        const n = i + 1;
        return (
          <div key={story.id} className="flex flex-col gap-6">
            <MockStoryCard story={story} state={state} minsAgo={30 + i * 85} />
            {signup.includes(n) && <MockSignupCard />}
            {whatsOn.includes(n) && events.length > 0 && (
              <>
                {notes && <Note>{n === whatsOn[0] ? "In the first screenful" : `${WHATS_ON_MIN_GAP} stories later, never beside another extra card`}</Note>}
                <MockWhatsOnCard events={events} today={state.today} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
