import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Match {
  story_id: string;
  title: string;
  matched_keyword: string;
  field: "title" | "body";
}

/**
 * "Clean up past stories": first looks (deletes nothing), then lists every
 * published story that matches Less of this. Stories are only removed after
 * the owner confirms in the dialog.
 */
export function CleanUpPastStories({ topicId, disabled }: { topicId: string; disabled?: boolean }) {
  const { toast } = useToast();
  const [scanning, setScanning] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [open, setOpen] = useState(false);

  const run = async (execute: boolean) => {
    if (execute) setRemoving(true);
    else setScanning(true);
    try {
      const { data, error } = await supabase.functions.invoke("purge-negative-keyword-stories", { body: { topicId, dryRun: !execute } });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Clean-up failed");
      if (execute) {
        toast({ title: `Removed ${data.purged} ${data.purged === 1 ? "story" : "stories"}` });
        setMatches(null);
        setOpen(false);
      } else {
        setMatches(data.matches || []);
        setOpen(true);
      }
    } catch (error) {
      toast({ title: "Couldn't check past stories", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setScanning(false);
      setRemoving(false);
    }
  };

  const count = matches?.length ?? 0;

  return (
    <>
      <button
        type="button"
        onClick={() => run(false)}
        disabled={disabled || scanning || removing}
        className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
      >
        {scanning && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
        {scanning ? "Checking…" : "Clean up past stories"}
      </button>

      <AlertDialog open={open} onOpenChange={(v) => !removing && setOpen(v)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{count > 0 ? `Remove ${count} past ${count === 1 ? "story" : "stories"}?` : "Nothing to clean up"}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                {count > 0 ? (
                  <>
                    <p className="text-sm">These published stories match Less of this. Removing them takes them out of the feed for good. Nothing has been removed yet.</p>
                    <ul className="max-h-64 divide-y overflow-y-auto rounded-md border">
                      {matches!.map((m) => (
                        <li key={m.story_id} className="p-2 text-sm">
                          <div className="line-clamp-1 font-medium text-foreground">{m.title}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">Matches “{m.matched_keyword}” in the {m.field === "title" ? "headline" : "story"}</div>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="text-sm">No published stories match Less of this.</p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>{count > 0 ? "Keep them" : "Close"}</AlertDialogCancel>
            {count > 0 && (
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  run(true);
                }}
                disabled={removing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {removing ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Removing…</> : `Remove ${count} ${count === 1 ? "story" : "stories"}`}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
