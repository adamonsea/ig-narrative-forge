import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  ctaText = "Read on...",
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
        className="sm:max-w-md border-0 shadow-2xl bg-background p-0 gap-0"
        hideCloseButton
      >
        <div className="p-8 md:p-12 text-center space-y-8">
          {/* Large bold headline */}
          <h2 className="text-2xl md:text-3xl lg:text-4xl font-bold tracking-tight text-foreground leading-tight">
            {headline}
          </h2>
          
          {/* Purple CTA button */}
          <Button 
            onClick={handleClose}
            size="lg"
            className="px-8 py-6 text-lg font-medium bg-primary hover:bg-primary/90"
          >
            {ctaText}
          </Button>
          
          {/* Optional About link */}
          {showAboutLink && aboutPageEnabled && (
            <div>
              <Link 
                to={`/feed/${topicSlug}/about`}
                onClick={handleClose}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-4"
              >
                About this feed
              </Link>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
