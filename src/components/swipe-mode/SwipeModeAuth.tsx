import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Mail } from 'lucide-react';

type AuthVariant = 'curiosity' | 'agency' | 'belonging';

interface SwipeModeAuthProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  topicSlug: string;
  variant?: AuthVariant;
}

const VARIANT_SUBTITLES: Record<AuthVariant, string> = {
  curiosity: 'See what others loved',
  agency: 'Make your vote count',
  belonging: 'Be part of the conversation',
};

export const SwipeModeAuth = ({ 
  open, 
  onOpenChange, 
  topicSlug,
  variant = 'curiosity' 
}: SwipeModeAuthProps) => {
  const { signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState('');
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
      const { error } = await signInWithMagicLink(email, undefined, `/play/${topicSlug}`);

      if (error) {
        toast.error(error.message);
      } else {
        setEmailSent(true);
        toast.success('Magic link sent! Check your email.');
      }
    } catch (error) {
      toast.error('Failed to send magic link');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = (open: boolean) => {
    if (!open) {
      // Reset state when closing
      setEmailSent(false);
      setEmail('');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        {!emailSent ? (
          <div className="py-10 px-4 space-y-8 text-center">
            {/* Title */}
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight">
                Register to play properly
              </h2>
              <p className="text-muted-foreground text-lg">
                {VARIANT_SUBTITLES[variant]}
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <Input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="text-center h-12"
              />

              <Button type="submit" className="w-full h-12 text-base" disabled={loading}>
                {loading ? 'Sending...' : 'Get magic link'}
              </Button>
            </form>
          </div>
        ) : (
          <div className="py-8 text-center space-y-4">
            <Mail className="w-16 h-16 mx-auto text-primary" />
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">Check your email</h2>
              <p className="text-muted-foreground">
                We've sent a magic link to <strong>{email}</strong>
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setEmailSent(false)}
            >
              Use a different email
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
