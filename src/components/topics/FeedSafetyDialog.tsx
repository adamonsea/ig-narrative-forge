import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { WorkspaceDrawer } from "@/components/workspace/WorkspaceDrawer";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface FeedSafetyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicId: string;
  topicName: string;
  onArchived: () => void;
}

export const FeedSafetyDialog = ({
  open,
  onOpenChange,
  topicId,
  topicName,
  onArchived,
}: FeedSafetyDialogProps) => {
  const { toast } = useToast();
  const [typed, setTyped] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [working, setWorking] = useState(false);

  const nameMatches = typed.trim().toLowerCase() === topicName.trim().toLowerCase();
  const canArchive = nameMatches && acknowledged && !working;

  const reset = () => {
    setTyped("");
    setAcknowledged(false);
  };

  const handleArchive = async () => {
    if (!canArchive) return;
    setWorking(true);
    try {
      // 1. Take a manual snapshot first (archive also snapshots automatically)
      const { error: backupError } = await supabase.rpc("create_topic_backup", {
        p_topic_id: topicId,
        p_reason: "manual_pre_archive",
      });
      if (backupError) throw backupError;

      // 2. Lift protection and archive in a single update
      const { error } = await supabase
        .from("topics")
        .update({
          deletion_protected: false,
          is_archived: true,
          archived_at: new Date().toISOString(),
        })
        .eq("id", topicId);
      if (error) throw error;

      toast({
        title: "Feed archived",
        description: "Backed up. Restore it any time from Backups.",
      });
      reset();
      onOpenChange(false);
      onArchived();
    } catch (error: any) {
      console.error("Archive failed:", error);
      toast({
        title: "Could not archive feed",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    } finally {
      setWorking(false);
    }
  };

  const close = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  return (
    <WorkspaceDrawer
      open={open}
      onOpenChange={close}
      title={`Archive ${topicName}`}
      srDescription="Back up and archive this feed"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)} disabled={working}>Cancel</Button>
          <Button variant="destructive" onClick={handleArchive} disabled={!canArchive}>
            {working ? "Backing up…" : "Back up and archive"}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        <Label htmlFor="confirm-feed-name" className="text-sm font-medium">Type the feed name</Label>
        <Input
          id="confirm-feed-name"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={topicName}
          autoComplete="off"
        />
      </div>
      <div className="flex items-start gap-3">
        <Checkbox id="ack-protection" checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} />
        <Label htmlFor="ack-protection" className="text-base font-normal leading-snug">
          Readers lose this feed until I restore it
        </Label>
      </div>
    </WorkspaceDrawer>
  );
};
