import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { EventCard } from "@/components/events/EventCard";
import { EventCategoryIllustration } from "@/components/events/EventCategoryIllustration";
import { EventCategoryIllustrationAlt } from "@/components/events/EventCategoryIllustrationAlt";
import { EVENT_CATEGORY_LABELS, type EventCategory } from "@/components/events/EventCategoryIcon";
import type { WhatsOnFeedEvent } from "@/lib/whatsOn";

/** Feed colours to try; the first is Whats on Lisbon's own. Sample data, not tokens. */
const SWATCHES: { name: string; color: string }[] = [
  { name: "Lisbon orange", color: "#D97724" },
  { name: "Teal", color: "#0E7C7B" },
  { name: "Blue", color: "#2F5BD3" },
  { name: "Berry", color: "#B8326B" },
];

/**
 * Real Whats on Lisbon listings (Agenda LX). Lisbon has no sport, nightlife, markets,
 * comedy, workshops or other listings yet, so those rows borrow a real Lisbon listing.
 */
const SAMPLES: { category: EventCategory; title: string; venue: string; date: string; borrowed?: boolean }[] = [
  { category: "music", title: "Rodrigo Leão", venue: "Coliseu dos Recreios", date: "2026-11-20" },
  { category: "family", title: "Exhibition of Models Built with LEGO® Bricks", venue: "Cordoaria Nacional", date: "2026-11-21" },
  { category: "sport", title: "Bike a Wish Tours", venue: "Bike a Wish", date: "2026-11-21", borrowed: true },
  { category: "food-drink", title: "Animals of Lisbon - Another history of the city", venue: "Museu de Lisboa - Palácio Pimenta", date: "2026-11-22" },
  { category: "arts-theatre", title: "Please, Love Me!", venue: "Teatro do Bairro Alto", date: "2026-11-22" },
  { category: "film", title: "Olhares do Mediterrâneo 2026", venue: "Atmosfera M", date: "2026-11-23" },
  { category: "talks", title: "Once Upon a Time in America", venue: "Pavilhão Julião Sarmento", date: "2026-11-24" },
  { category: "nightlife", title: "Misty Fest", venue: "Capitólio", date: "2026-11-25", borrowed: true },
  { category: "outdoors", title: "Discovering the Castle", venue: "Castelo de São Jorge", date: "2026-11-26" },
  { category: "markets", title: "Coexistências: Jewellery and the World’s Beauty", venue: "MUDE - Museu do Design", date: "2026-11-27", borrowed: true },
  { category: "comedy", title: "May I help you? Posso Ajudar?", venue: "MAC/CCB", date: "2026-11-27", borrowed: true },
  { category: "workshops", title: "Painting Is Easy. Do It Yourself!", venue: "Fundação Calouste Gulbenkian", date: "2026-11-28", borrowed: true },
  { category: "other", title: "Camera Obscura", venue: "Castelo de São Jorge", date: "2026-11-29", borrowed: true },
];

function toEvent(s: (typeof SAMPLES)[number]): WhatsOnFeedEvent {
  return {
    id: `compare-${s.category}`, title: s.title, start_date: s.date, start_time: null, location: s.venue,
    source_url: "https://www.agendalx.pt/?lang=en", source_name: "agendalx.pt", event_type: s.category,
    price: null, is_free: null, description: null,
  };
}

/** The compare view itself (no guard), so the page can be checked on its own. */
export function EventCardsCompareBody() {
  const [color, setColor] = useState(SWATCHES[0].color);
  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto max-w-4xl space-y-8 px-4 py-12 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">Event cards: A or B</h1>
          <div className="flex gap-2" role="radiogroup" aria-label="Feed colour">
            {SWATCHES.map((s) => (
              <button key={s.color} type="button" role="radio" aria-checked={color === s.color} aria-label={s.name} title={s.name}
                onClick={() => setColor(s.color)}
                className={cn("h-11 w-11 rounded-full border border-border transition-shadow",
                  color === s.color && "ring-2 ring-purple-bright ring-offset-2 ring-offset-background")}
                style={{ backgroundColor: s.color }} />
            ))}
          </div>
        </header>

        {SAMPLES.map((s) => {
          const event = toEvent(s);
          return (
            <section key={s.category} className="space-y-3" aria-labelledby={`cmp-${s.category}`}>
              <h2 id={`cmp-${s.category}`} className="text-lg font-semibold">
                {EVENT_CATEGORY_LABELS[s.category]}
                {s.borrowed && <span className="ml-2 text-sm font-normal text-muted-foreground">Borrowed listing</span>}
              </h2>
              <div className="flex flex-wrap gap-6">
                {(["A", "B"] as const).map((set) => (
                  <figure key={set} className="w-[360px] max-w-full space-y-2">
                    <figcaption className="text-sm text-muted-foreground">{set}</figcaption>
                    <EventCard event={event} brandColor={color} isOwner
                      Illustration={set === "A" ? EventCategoryIllustration : EventCategoryIllustrationAlt} />
                  </figure>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </main>
  );
}

export default function EventCardsCompare() {
  const { user, userRole, loading, isAdmin } = useAuth();
  // The role arrives just after sign-in; wait for it so admins aren't bounced to the dashboard
  if (loading || (user && userRole === null)) return <main className="min-h-dvh bg-background p-8"><Skeleton className="h-8 w-48" /></main>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return <EventCardsCompareBody />;
}
