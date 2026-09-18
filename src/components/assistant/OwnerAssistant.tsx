import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowUp, HelpCircle, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  destinationById,
  destinationHref,
  highlightAnchor,
} from "@/lib/assistantDestinations";

interface Action {
  label: string;
  destination: string;
}

interface Nudge {
  title: string;
  body: string;
  destination?: string;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
  steps?: string[];
  actions?: Action[];
  nudge?: Nudge | null;
}

const OPENING_PILLS = [
  "Why aren't new stories arriving?",
  "How do I publish a story?",
  "Make my feed more local",
  "Set up email for my readers",
];

interface Props {
  topicId: string;
  topicSlug: string;
  topicName: string;
}

export const OwnerAssistant = ({ topicId, topicSlug, topicName }: Props) => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pills, setPills] = useState<string[]>(OPENING_PILLS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, busy]);

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setError(null);
    setInput("");
    const history = [...turns, { role: "user" as const, content: text }];
    setTurns(history);
    setBusy(true);

    const { data, error: fnError } = await supabase.functions.invoke("owner-assistant", {
      body: {
        topicId,
        messages: history.map(({ role, content }) => ({ role, content })),
      },
    });

    setBusy(false);

    if (fnError || !data || (data as any).error) {
      setError("I couldn't answer just then. Try again in a moment.");
      return;
    }

    setTurns((prev) => [
      ...prev,
      {
        role: "assistant",
        content: (data as any).answer || "",
        steps: (data as any).steps || [],
        actions: (data as any).actions || [],
        nudge: (data as any).nudge || null,
      },
    ]);
    const next = (data as any).suggestions;
    setPills(Array.isArray(next) && next.length ? next : OPENING_PILLS);
  };

  const go = (destinationId: string) => {
    const destination = destinationById(destinationId);
    if (!destination) return;
    const href = destinationHref(destination, topicSlug);
    if (destination.external) {
      window.open(href, "_blank", "noopener");
      return;
    }
    navigate(href);
    if (destination.anchor) window.setTimeout(() => highlightAnchor(destination.anchor!), 250);
    if (window.innerWidth < 768) setOpen(false);
  };

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 h-12 rounded-full pl-4 pr-5 shadow-lg"
      >
        <HelpCircle className="mr-2 h-4 w-4" />
        Help
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-label="Feed help"
      className="fixed bottom-0 right-0 z-40 flex h-[min(34rem,85dvh)] w-full flex-col overflow-hidden border border-border bg-background shadow-2xl sm:bottom-5 sm:right-5 sm:w-[24rem] sm:rounded-2xl"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p className="text-sm font-medium">Help with {topicName}</p>
          <p className="text-xs text-muted-foreground">Ask anything about running your feed</p>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Close help">
          <X className="h-4 w-4" />
        </Button>
      </header>

      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {turns.length === 0 && (
          <p className="text-sm text-muted-foreground">
            I know how your feed is set up right now, and I can take you straight to the right setting.
          </p>
        )}

        {turns.map((turn, index) =>
          turn.role === "user" ? (
            <div key={index} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-primary px-3.5 py-2 text-sm text-primary-foreground">
                {turn.content}
              </p>
            </div>
          ) : (
            <div key={index} className="space-y-3 text-sm">
              <p className="leading-relaxed">{turn.content}</p>
              {!!turn.steps?.length && (
                <ol className="space-y-2">
                  {turn.steps.map((step, stepIndex) => (
                    <li key={stepIndex} className="flex items-start gap-2.5">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
                        {stepIndex + 1}
                      </span>
                      <span className="text-muted-foreground">{step}</span>
                    </li>
                  ))}
                </ol>
              )}
              {!!turn.actions?.length && (
                <div className="flex flex-wrap gap-2">
                  {turn.actions.map((action) => (
                    <Button
                      key={action.destination + action.label}
                      variant="outline"
                      size="sm"
                      onClick={() => go(action.destination)}
                    >
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
              {turn.nudge && (
                <div className="rounded-xl border border-dashed border-border bg-muted/40 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Not using this yet
                  </p>
                  <p className="mt-1 font-medium">{turn.nudge.title}</p>
                  <p className="mt-0.5 text-muted-foreground">{turn.nudge.body}</p>
                  {turn.nudge.destination && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 -ml-2 h-8"
                      onClick={() => go(turn.nudge!.destination!)}
                    >
                      Take a look
                    </Button>
                  )}
                </div>
              )}
            </div>
          ),
        )}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Thinking…
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
      </div>

      {!!pills.length && !busy && (
        <div className="flex flex-wrap gap-1.5 border-t border-border px-4 py-3">
          {pills.map((pill) => (
            <button
              key={pill}
              type="button"
              onClick={() => ask(pill)}
              className={cn(
                "rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground",
                "transition-colors hover:border-foreground hover:text-foreground",
              )}
            >
              {pill}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-end gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
      >
        <Textarea
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              ask(input);
            }
          }}
          rows={1}
          placeholder="Ask a question…"
          className="min-h-[2.5rem] resize-none text-sm"
        />
        <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
          <ArrowUp className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
};
