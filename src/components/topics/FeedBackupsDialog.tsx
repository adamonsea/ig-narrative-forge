import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { WorkspaceDrawer } from "@/components/workspace/WorkspaceDrawer";
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
  const [restoreTarget, setRestoreTarget] = useState<BackupRow | null>(null);

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
    <WorkspaceDrawer
      open={open}
      onOpenChange={onOpenChange}
      title="Backups"
      srDescription={`Backups of ${topicName}`}
      footer={
        <Button variant="outline" onClick={createBackup} disabled={busyId === "new"}>
          <Save className="mr-2 h-4 w-4" aria-hidden="true" />
          Back up now
        </Button>
      }
    >
      {loading ? (
        <ul className="space-y-2" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <li key={i} className="space-y-2 rounded-xl border border-border p-4">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-56" />
            </li>
          ))}
        </ul>
      ) : backups.length === 0 ? (
        <p className="text-base text-muted-foreground">No backups yet.</p>
      ) : (
        <ul className="space-y-2">
          {backups.map((b) => {
            const counts = b.snapshot?.counts || {};
            return (
              <li key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-4">
                <div className="min-w-0 space-y-1">
                  <p className="text-base font-medium">{new Date(b.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</p>
                  <p className="text-sm text-muted-foreground">
                    {reasonLabel[b.reason] || b.reason} · {counts.sources ?? 0} sources · {counts.subscribers ?? 0} subscribers
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" onClick={() => download(b)} aria-label="Download">
                        <Download className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Download</TooltipContent>
                  </Tooltip>
                  <Button size="sm" variant="outline" onClick={() => setRestoreTarget(b)} disabled={busyId === b.id}>
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    Restore
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <ConfirmationDialog
        isOpen={!!restoreTarget}
        onClose={() => setRestoreTarget(null)}
        onConfirm={() => { if (restoreTarget) restore(restoreTarget); }}
        title="Restore this backup?"
        description={restoreTarget ? `Settings, sources and subscribers go back to ${new Date(restoreTarget.created_at).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}.` : ""}
        confirmText="Restore"
      />
    </WorkspaceDrawer>
  );
};
