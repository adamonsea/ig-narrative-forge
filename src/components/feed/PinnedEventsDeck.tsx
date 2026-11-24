import { useMemo } from "react";
import { CardPack } from "@/components/card-pack/CardPack";
import type { CardPackSection } from "@/components/card-pack/types";
import "@/components/card-pack/card-pack.css";
import { usePinnedEvents, type PinnedEvent } from "@/hooks/usePinnedEvents";
import { eventPhotoUrl } from "@/lib/eventPhotos";
import { eventIllustrationTint, feedBrandPalette, toCss } from "@/lib/feedBrandColor";
import { dateBlock, eventTime } from "@/lib/whatsOn";
import { EVENT_CATEGORY_LABELS, isEventCategory } from "@/components/events/EventCategoryIcon";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";

/**
 * The owner's pinned events as a fanned hand of cards above the feed. Flick to browse;
 * tap the centre card to jump to its full card in the feed (or the listing if not loaded).
 */
export function PinnedEventsDeck({ topicId, brandColor }: { topicId: string; brandColor?: string | null | undefined }) {
  const { data } = usePinnedEvents(topicId);
  const events = data ?? [];
  const palette = feedBrandPalette(brandColor);
  const sections = useMemo<CardPackSection[]>(() => events.map((e) => ({
    slug: e.id, kicker: "", title: e.title, cover: null, meta: { event: e },
  })), [events]);
  if (!events.length) return null;

  const open = (e: PinnedEvent) => {
    const el = document.getElementById(`event-card-${e.id}`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    else if (e.source_url) window.open(e.source_url, "_blank", "noopener,noreferrer");
  };

  return (
    <section aria-label="Pinned events" className="w-full max-w-2xl">
      <div className="h-[460px]">
        <CardPack
          sections={sections}
          initialState="open"
          showCloseButton={false}
          showDots={events.length > 1}
          edgeBehaviour={events.length > 2 ? "wrap" : "clamp"}
          aspect={300 / 420}
          theme={{
            cardSurface: "hsl(var(--feed-card))",
            title: "hsl(var(--feed-card-foreground))",
            accent: toCss(palette.light.fill),
            accentText: toCss(palette.light.onFill),
            radius: 20,
          }}
          onActivate={(s) => open((s.meta as { event: PinnedEvent }).event)}
          renderCard={(s) => <PinnedCard e={(s.meta as { event: PinnedEvent }).event} brandColor={brandColor} />}
        />
      </div>
    </section>
  );
}

function PinnedCard({ e, brandColor }: { e: PinnedEvent; brandColor?: string | null | undefined }) {
  const category = isEventCategory(e.event_type) ? e.event_type : "other";
  const photo = eventPhotoUrl(e.image_path);
  const b = dateBlock(e.start_date);
  const p = feedBrandPalette(brandColor);
  return (
    <div className="flex h-full flex-col overflow-hidden text-left text-[hsl(var(--feed-card-foreground))]">
      <div className="relative h-[52%] shrink-0 overflow-hidden">
        {photo
          ? <img src={photo} alt="" loading="lazy" className="h-full w-full object-cover" draggable={false} />
          : <EventCategoryIllustration category={category} color={toCss(eventIllustrationTint(brandColor))} animate={false} />}
        <div className="absolute bottom-3 left-3 rounded-xl px-3 py-2 text-center font-lexend leading-none shadow-md"
          style={{ background: toCss(p.light.fill), color: toCss(p.light.onFill) }}>
          <div className="text-sm font-semibold">{b.weekday}</div>
          <div className="my-1 text-3xl font-bold">{b.day}</div>
          <div className="text-sm font-semibold">{b.month}</div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-4">
        <span className="text-sm font-semibold opacity-70">{EVENT_CATEGORY_LABELS[category]}</span>
        <h3 className="line-clamp-3 font-lexend text-xl font-semibold leading-tight">{e.title}</h3>
        <p className="mt-auto truncate text-sm opacity-70">{[eventTime(e.start_time), e.location].filter(Boolean).join(" · ")}</p>
      </div>
    </div>
  );
}
