import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { BILLING_COPY } from '@/lib/billing';

interface ProGateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  returnTo?: string;
}

export function ProGateDialog({ open, onOpenChange, returnTo }: ProGateDialogProps) {
  const navigate = useNavigate();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{BILLING_COPY.distributionTitle}</DialogTitle>
          <DialogDescription>{BILLING_COPY.distributionBody}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={() => navigate(`/pricing${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`)}>
            Unlock with Pro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}