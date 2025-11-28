import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface WaitlistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planName?: string;
}

export function WaitlistModal({ open, onOpenChange, planName }: WaitlistModalProps) {
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setIsSubmitting(true);
    try {
      const { error } = await supabase.functions.invoke('waitlist-signup', {
        body: { email, plan: planName || 'general' }
      });

      if (error) throw error;

      toast.success('You\'re on the list!', {
        description: 'We\'ll notify you when we launch.'
      });
      setEmail('');
      onOpenChange(false);
    } catch (err) {
      toast.error('Something went wrong', {
        description: 'Please try again later.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-[hsl(214,50%,12%)] border-[hsl(270,100%,68%)]/20 max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl font-display text-white text-center">
            Join the waitlist
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6 py-4">
          <p className="text-white/70 text-center">
            {planName 
              ? `Be the first to know when our ${planName} plan launches.`
              : 'Be the first to know when we launch.'}
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="bg-[hsl(214,50%,15%)] border-[hsl(270,100%,68%)]/30 text-white placeholder:text-white/40 h-12"
              required
            />
            <Button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full h-12 rounded-full bg-[hsl(155,100%,67%)] text-[hsl(214,50%,9%)] hover:bg-[hsl(155,100%,60%)] font-medium"
            >
              {isSubmitting ? 'Joining...' : 'Notify me'}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
