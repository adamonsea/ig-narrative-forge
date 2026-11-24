import { useState } from "react";
import { toast } from "sonner";
import { PinButton } from "@/components/topic-pipeline/DeskCard";
import { usePinnedEvents, useSetEventPin } from "@/hooks/usePinnedEvents";

/** One-click pin for a live event: it joins the fan of pinned cards at the top of the feed. */
export function EventPinButton({ eventId, topicId }: { eventId: string; topicId?: string | undefined }) {
  const { data } = usePinnedEvents(topicId);
  const setPin = useSetEventPin(topicId);
  const [busy, setBusy] = useState(false);
  if (!topicId) return null;
  const pinned = Boolean(data?.some((p) => p.id === eventId));
  return (
    <PinButton
      pinned={pinned}
      busy={busy}
      pinLabel="Pin to top"
      onClick={async () => {
        setBusy(true);
        try { await setPin(eventId, !pinned); }
        catch (e) { toast.error(e instanceof Error && e.message.includes("9") ? "Up to 9 pinned events" : "Couldn't pin. Try again."); }
        finally { setBusy(false); }
      }}
    />
  );
}
