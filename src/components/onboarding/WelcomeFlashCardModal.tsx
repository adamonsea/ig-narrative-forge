import { Dialog, DialogContent, DialogOverlay } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface WelcomeFlashCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  topicSlug: string;
  headline?: string;
  ctaText?: string;
  showAboutLink?: boolean;
  aboutPageEnabled?: boolean;
}

export const WelcomeFlashCardModal = ({
  isOpen,
  onClose,
  topicSlug,
  headline = "Welcome to your feed",
  ctaText = "Start Reading",
  showAboutLink = false,
  aboutPageEnabled = false
}: WelcomeFlashCardModalProps) => {
  const handleClose = () => {
    // Store dismissal
    localStorage.setItem(`welcome_shown_${topicSlug}`, 'true');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent 
        className="sm:max-w-md border-0 shadow-2xl bg-background/95 backdrop-blur-md"
      >
        <div className="p-4 text-center space-y-6">
          <h2 className="text-2xl font-bold tracking-tight text-foreground">
            {headline}
          </h2>
          
          <Button 
            onClick={handleClose}
            size="lg"
            className="w-full font-medium"
          >
            {ctaText}
          </Button>
          
          {showAboutLink && aboutPageEnabled && (
            <Link 
              to={`/feed/${topicSlug}/about`}
              onClick={handleClose}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <HelpCircle className="w-4 h-4" />
              About this feed
            </Link>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
