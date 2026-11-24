import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { eventCardMode, type EventCardMode, type FeedLead } from "@/lib/feedCardPositions";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";
import { CURRENCY_SYMBOL, FEED_CURRENCIES, isFeedCurrency, type FeedCurrency } from "@/lib/currency";

interface Props {
  topicId: string;
  lead: string | null | undefined;
  cards: string | null | undefined;
  currency?: string | null | undefined;
  /** Show listing photos on individual cards (on unless turned off). */
  photos?: boolean | null | undefined;
  onSaved: (values: Record<string, unknown>) => void;
}

function Choice<T extends string>({ id, label, value, options, onChange }: { id: string; label: string; value: T | null; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div>
      <span className="sr-only" id={id}>{label}</span>
      <div className={cn("grid w-full gap-2 sm:w-72", options.length === 3 ? "grid-cols-3" : "grid-cols-2")} role="radiogroup" aria-labelledby={id}>
        {options.map(([v, text]) => (
          <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)}
            className={cn("min-h-11 rounded-lg border p-3 text-left text-base transition-colors",
              value === v ? "border-primary bg-primary/5 font-medium" : "border-border hover:border-muted-foreground/40")}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

/** "Lead with: News | Events", "Event cards: Grouped | Individual", the event price currency and event photos. Auto-saves. */
export function FeedLeadSettings({ topicId, lead, cards, currency, photos, onSaved }: Props) {
  const [state, setState] = useState<SaveState>(null);
  const currentLead: FeedLead = lead === "events" ? "events" : "news";
  const currentCards = eventCardMode(currentLead, cards);

  const save = async (values: Record<string, unknown>) => {
    setState("saving");
    const { error } = await supabase.from("topics").update({ ...values, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) { setState("not-saved"); return false; }
    onSaved(values);
    setState("saved");
    return true;
  };

  const chooseLead = async (next: FeedLead) => {
    if (next === currentLead) return;
    // Events-led needs events on and shown in the feed: one visible change, never a bypass
    const ok = await save(next === "events" ? { feed_lead: next, events_enabled: true } : { feed_lead: next });
    if (ok && next === "events") {
      const { data } = await supabase.from("topic_insight_settings").update({ events_cards_enabled: true } as never).eq("topic_id", topicId).select("topic_id");
      if (!data || data.length === 0) await supabase.from("topic_insight_settings").insert({ topic_id: topicId, events_cards_enabled: true } as never);
    }
  };

  return (
    <SettingGroup id="events-show" title="How events show">
      <SettingRow label="Lead with" hint="What readers see first.">
        <SaveIndicator state={state} />
        <Choice id="feed-lead" label="Lead with" value={currentLead} options={[["news", "News"], ["events", "Events"]]} onChange={chooseLead} />
      </SettingRow>
      <SettingRow label="Event cards" hint="One card per day, or one per event.">
        <Choice id="event-cards" label="Event cards" value={currentCards}
          options={[["grouped", "Grouped"], ["individual", "Individual"]]}
          onChange={(v: EventCardMode) => { if (v !== currentCards) void save({ event_cards: v }); }} />
      </SettingRow>
      {currentCards === "individual" && (
        <SettingRow label="Currency" hint="Used when a price has no symbol.">
          <Choice id="event-currency" label="Currency" value={isFeedCurrency(currency) ? currency : null}
            options={FEED_CURRENCIES.map((c) => [c, CURRENCY_SYMBOL[c]] as [FeedCurrency, string])}
            onChange={(v: FeedCurrency) => { if (v !== currency) void save({ event_currency: v }); }} />
        </SettingRow>
      )}
      {currentCards === "individual" && (
        <SettingRow label="Event photos" hint="Use the listing's own photo when there is one.">
          <Switch id="event-photos" aria-label="Event photos" checked={photos !== false} onCheckedChange={(on) => void save({ event_photos_enabled: on })} />
        </SettingRow>
      )}
    </SettingGroup>
  );
}
