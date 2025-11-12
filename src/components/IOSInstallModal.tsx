import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Share, Plus, CheckCircle } from 'lucide-react';

interface IOSInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicName: string;
}

export const IOSInstallModal = ({ isOpen, onClose, topicName }: IOSInstallModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add {topicName} to Home Screen</DialogTitle>
          <DialogDescription>
            Follow these simple steps to get instant access
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="flex gap-3 items-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
              1
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Tap the Share button</p>
                <Share className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                Look for the share icon in your browser toolbar
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
              2
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Select "Add to Home Screen"</p>
                <Plus className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                Scroll down in the menu if you don't see it right away
              </p>
            </div>
          </div>

          <div className="flex gap-3 items-start">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold">
              3
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Tap "Add"</p>
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <p className="text-xs text-muted-foreground">
                The {topicName} icon will appear on your home screen
              </p>
            </div>
          </div>
        </div>

        <Button onClick={onClose} className="w-full">
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
};
