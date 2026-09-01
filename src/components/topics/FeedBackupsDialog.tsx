import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Download, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface BackupRow {
  id: string;
  topic_name: string;
  reason: string;
  created_at: string;
  snapshot: any;
}

interface FeedBackupsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  topicName: string;
  onRestored?: () => void;
}

const reasonLabel: Record<string, string> = {
  manual: "Manual",
  manual_pre_archive: "Before archive",
  pre_archive: "Before archive",
  pre_delete: "Before deletion",
  scheduled: "Nightly",
};

export const FeedBackupsDialog = ({
  open,
  onOpenChange,
  topicId,
  topicName,
  onRestored,
}: FeedBackupsDialogProps) => {
  const { toast } = useToast();
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("topic_backups")
        .select("id, topic_name, reason, created_at, snapshot")
        .eq("topic_id", topicId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      setBackups((data || []) as BackupRow[]);
    } catch (error: any) {
      console.error("Failed to load backups:", error);
      toast({
        title: "Could not load backups",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, topicId]);

  const createBackup = async () => {
    setBusyId("new");
    try {
      const { error } = await supabase.rpc("create_topic_backup", {
        p_topic_id: topicId,
        p_reason: "manual",
      });
      if (error) throw error;
      toast({ title: "Backup saved", description: `Snapshot of "${topicName}" stored.` });
      await load();
    } catch (error: any) {
      toast({
        title: "Backup failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const restore = async (backup: BackupRow) => {
    if (
      !confirm(
        `Restore "${backup.topic_name}" from the backup taken on ${new Date(
          backup.created_at
        ).toLocaleString()}? Settings, sources and subscribers will be restored and the feed un-archived.`
      )
    )
      return;
    setBusyId(backup.id);
    try {
      const { data, error } = await supabase.rpc("restore_topic_from_backup", {
        p_backup_id: backup.id,
      });
      if (error) throw error;
      const result = (data || {}) as any;
      toast({
        title: "Feed restored",
        description: `${result.sources_restored ?? 0} source links and ${
          result.subscribers_restored ?? 0
        } subscribers restored.`,
      });
      onRestored?.();
    } catch (error: any) {
      toast({
        title: "Restore failed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  };

  const download = (backup: BackupRow) => {
    const blob = new Blob([JSON.stringify(backup.snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${backup.topic_name.replace(/\s+/g, "-").toLowerCase()}-backup-${backup.created_at}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Backups — {topicName}</DialogTitle>
          <DialogDescription>
            Snapshots are taken nightly, before archiving and on demand. Restoring brings back
            settings, sources, keywords and subscribers.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={createBackup} disabled={busyId === "new"}>
            <Save className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            {busyId === "new" ? "Saving…" : "Back up now"}
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner size="lg" />
          </div>
        ) : backups.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No backups yet — take one now.
          </p>
        ) : (
          <ul className="space-y-2">
            {backups.map((b) => {
              const counts = b.snapshot?.counts || {};
              return (
                <li
                  key={b.id}
                  className="flex items-center justify-between gap-3 rounded-xl border p-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {new Date(b.created_at).toLocaleString()}
                      </span>
                      <Badge variant="secondary" className="text-[10px]">
                        {reasonLabel[b.reason] || b.reason}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {counts.sources ?? 0} sources · {counts.articles ?? 0} articles ·{" "}
                      {counts.subscribers ?? 0} subscribers
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => download(b)}
                      aria-label="Download backup as JSON"
                    >
                      <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => restore(b)}
                      disabled={busyId === b.id}
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                      {busyId === b.id ? "Restoring…" : "Restore"}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
};
