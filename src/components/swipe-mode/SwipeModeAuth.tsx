import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

interface SwipeModeAuthProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicSlug: string;
}

export const SwipeModeAuth = ({ open, onOpenChange, topicSlug }: SwipeModeAuthProps) => {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setLoading(true);

    try {
      const { error } = await signInWithMagicLink(email, displayName, `/play/${topicSlug}`);

      if (error) {
        toast.error(error.message);
      } else {
        setEmailSent(true);
        toast.success('Magic link sent! Check your email to continue.');
      }
    } catch (error) {
      toast.error('Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Sign in to Swipe Mode
          </DialogTitle>
          <DialogDescription>
            {emailSent 
              ? "Check your email for a magic link to continue."
              : "Enter your email to get started. We'll send you a magic link to sign in instantly."}
          </DialogDescription>
        </DialogHeader>

        {!emailSent ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name (optional)</Label>
              <Input
                id="displayName"
                type="text"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Sending...' : 'Send Magic Link'}
            </Button>
          </form>
        ) : (
          <div className="text-center py-8">
            <Mail className="w-16 h-16 mx-auto mb-4 text-primary" />
            <p className="text-muted-foreground">
              We've sent a magic link to <strong>{email}</strong>
            </p>
            <Button
              variant="outline"
              onClick={() => setEmailSent(false)}
              className="mt-4"
            >
              Use a different email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
