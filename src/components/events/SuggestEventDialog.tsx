import { useState } from "react";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getVisitorId } from "@/lib/visitorIdentity";
import { londonToday } from "@/lib/whatsOn";

const addMonths = (ymd: string, n: number) => {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, d)).toISOString().slice(0, 10);
};

async function errorText(error: unknown): Promise<string> {
  try {
    const res = (error as { context?: Response }).context;
    const body = res ? await res.json() : null;
    if (body?.error && typeof body.error === "string") return body.error;
  } catch { /* fall through */ }
  return "Couldn't send that just now. Please try again.";
}

/** Reader's "+ Add an event": four fields, a required listing link, and the editor checks it first. */
export function SuggestEventButton({ topicId, className }: { topicId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const today = londonToday();

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const val = (k: string) => String(f.get(k) ?? "").trim();
    let url = val("url");
    if (url && !/^https?:\/\//i.test(url)) url = `https://${url}`;
    setBusy(true); setError(null);
    const { error } = await supabase.functions.invoke("scrape-whats-on", {
      body: {
        action: "suggest", topicId, title: val("title"), date: val("date"), time: val("time"),
        venue: val("venue"), url, visitorId: getVisitorId(), website: val("website"),
      },
    });
    setBusy(false);
    if (error) setError(await errorText(error));
    else setSent(true);
  };

  return (
    <>
      <button type="button" onClick={() => { setSent(false); setError(null); setOpen(true); }}
        className={className ?? "inline-flex min-h-9 items-center gap-1 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"}>
        <Plus className="h-3.5 w-3.5" aria-hidden="true" />Add an event
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          {sent ? (
            <>
              <DialogHeader>
                <DialogTitle>Thanks – the editor will take a look.</DialogTitle>
                <DialogDescription>If it's a good fit, it'll appear in What's on.</DialogDescription>
              </DialogHeader>
              <Button onClick={() => setOpen(false)} className="mt-2">Done</Button>
            </>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <DialogHeader>
                <DialogTitle>Add an event</DialogTitle>
                <DialogDescription>The feed's editor checks every event before it appears.</DialogDescription>
              </DialogHeader>
              <div className="space-y-1.5">
                <Label htmlFor="sg-title">Event name</Label>
                <Input id="sg-title" name="title" required minLength={3} maxLength={160} autoComplete="off" />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sg-date">Date</Label>
                  <Input id="sg-date" name="date" type="date" required min={today} max={addMonths(today, 3)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="sg-time">Start time <span className="font-normal text-muted-foreground">(optional)</span></Label>
                  <Input id="sg-time" name="time" type="time" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sg-venue">Venue or place</Label>
                <Input id="sg-venue" name="venue" required minLength={2} maxLength={160} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sg-url">Link to the full listing</Label>
                <Input id="sg-url" name="url" type="text" inputMode="url" required placeholder="https://" maxLength={2000} />
              </div>
              {/* Spam trap: hidden from people */}
              <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" />
              {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
              <Button type="submit" disabled={busy} className="w-full">{busy ? "Sending…" : "Send to the editor"}</Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
