import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ShieldAlert } from "lucide-react";
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
        description: `"${topicName}" was backed up and archived. You can restore it from the archive.`,
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

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" aria-hidden="true" />
            Archive "{topicName}"
          </DialogTitle>
          <DialogDescription>
            This feed is protected against accidental removal. Confirm below to archive it.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertDescription className="text-sm">
            A full backup (settings, sources, keywords, subscribers and published story list) is
            saved automatically before archiving, so the feed can be restored later.
          </AlertDescription>
        </Alert>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="confirm-feed-name">
              Type the feed name to confirm
            </Label>
            <Input
              id="confirm-feed-name"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={topicName}
              autoComplete="off"
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="ack-protection"
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(v === true)}
            />
            <Label htmlFor="ack-protection" className="text-sm font-normal leading-snug">
              I understand this takes the feed offline for readers and removes it from my dashboard.
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={working}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleArchive} disabled={!canArchive}>
            {working ? "Backing up…" : "Back up & archive"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
