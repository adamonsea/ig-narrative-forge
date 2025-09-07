import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Merge } from "lucide-react";
import { DuplicateCleanupManager } from "./DuplicateCleanupManager";

interface DuplicateCleanupDialogProps {
  onSuccess?: () => void;
}

export const DuplicateCleanupDialog = ({ onSuccess }: DuplicateCleanupDialogProps) => {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Merge className="h-4 w-4 mr-2" />
          Clean Duplicates
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Clean Up Duplicate Articles</DialogTitle>
          <DialogDescription>
            Remove duplicate articles that are cluttering your pipeline. This will automatically merge or remove exact URL duplicates.
          </DialogDescription>
        </DialogHeader>
        <DuplicateCleanupManager />
      </DialogContent>
    </Dialog>
  );
};