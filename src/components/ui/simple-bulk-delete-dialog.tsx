import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertTriangle } from "lucide-react";

interface SimpleBulkDeleteDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  selectedCount: number;
}

export const SimpleBulkDeleteDialog = ({ 
  isOpen, 
  onClose, 
  onConfirm, 
  selectedCount 
}: SimpleBulkDeleteDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Confirm Bulk Delete
          </DialogTitle>
          <DialogDescription>
            Are you sure you want to delete {selectedCount} selected multi-tenant articles? 
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        
        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Delete {selectedCount} Articles
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};