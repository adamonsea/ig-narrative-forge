import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Loader2, MailCheck } from 'lucide-react';
import { savePendingBlueprint, type FeedBlueprint } from '@/lib/feedBlueprint';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  blueprint: FeedBlueprint | null;
  input: string;
}

// Homepage ink palette: deep navy canvas, violet glow, mint pill action.
const INK = 'hsl(214, 50%, 9%)';
const VIOLET = 'hsl(270, 100%, 68%)';
const MINT = 'hsl(155, 100%, 67%)';

export const BlueprintAccountDialog = ({ open, onOpenChange, blueprint, input }: Props) => {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const recordLead = async (userId?: string) => {
    if (!blueprint) return;
    try {
      await supabase.functions.invoke('feed-ideas', {
        body: { action: 'capture', email, input, blueprint, userId },
      });
    } catch {
      // never block the journey on lead capture
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blueprint) return;
    setLoading(true);
    setError(null);

    // Keep the blueprint safe no matter what happens next.
    savePendingBlueprint(blueprint, input);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (signUpError) throw signUpError;
        await recordLead(data.user?.id);
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        navigate('/dashboard');
      } else {
        const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        await recordLead(data.user?.id);
        navigate('/dashboard');
      }
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Something went wrong.';
      setError(
        /already registered/i.test(message)
          ? 'You already have an account — switch to "I already have an account" below.'
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  const inputClasses =
    'h-14 rounded-full border-white/10 bg-white/[0.04] px-6 text-base text-white placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-[hsl(270,100%,68%)] focus-visible:border-[hsl(270,100%,68%)]';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="gap-0 overflow-hidden rounded-[2rem] border border-white/10 p-0 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.8)] sm:max-w-md"
        style={{ backgroundColor: INK }}
      >
        {/* Ambient glows — violet top right, mint bottom left */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full opacity-10 blur-[100px]"
          style={{ backgroundColor: VIOLET }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -left-32 h-80 w-80 rounded-full opacity-5 blur-[120px]"
          style={{ backgroundColor: MINT }}
        />

        {checkEmail ? (
          <div className="relative z-10 space-y-5 px-8 py-12 text-center sm:px-12">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40" aria-label="Curatr">
              Curatr.pro
            </div>
            <MailCheck className="mx-auto h-9 w-9" style={{ color: MINT }} />
            <DialogTitle className="font-display text-3xl italic tracking-tight text-white">
              Check your email
            </DialogTitle>
            <p className="text-base leading-relaxed text-[hsl(214,20%,70%)]">
              We've sent a confirmation link to <strong className="text-white">{email}</strong>. Open it and your
              feed <strong className="text-white">{blueprint?.feed_title}</strong> will be waiting, ready to build.
            </p>
            <Button
              className="h-14 w-full rounded-full text-base font-bold"
              style={{ backgroundColor: MINT, color: INK }}
              onClick={() => onOpenChange(false)}
            >
              Got it
            </Button>
          </div>
        ) : (
          <div className="relative z-10 px-8 pb-10 pt-12 sm:px-12">
            <div className="mb-10 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40" aria-label="Curatr">
                Curatr.pro
              </div>
              <h2 className="font-display mt-6 text-4xl italic tracking-tight text-white">
                Save your feed
              </h2>
              <DialogDescription className="mt-3 text-sm leading-relaxed text-[hsl(214,20%,70%)]">
                {blueprint
                  ? `Create an account to build “${blueprint.feed_title}”.`
                  : 'Create an account to start building.'}
              </DialogDescription>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="bp-email" className="ml-4 text-xs font-medium uppercase tracking-wider text-white/40">
                  Email
                </Label>
                <Input
                  id="bp-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className={inputClasses}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bp-password" className="ml-4 text-xs font-medium uppercase tracking-wider text-white/40">
                  Password
                </Label>
                <Input
                  id="bp-password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                  className={inputClasses}
                  minLength={6}
                  required
                />
              </div>

              {error && <p className="text-sm text-red-300">{error}</p>}

              <Button
                type="submit"
                className="h-14 w-full rounded-full text-base font-bold transition-transform active:scale-[0.98]"
                style={{ backgroundColor: MINT, color: INK }}
                disabled={loading}
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" style={{ color: INK }} />}
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>

              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                }}
                className="mx-auto block text-sm text-[hsl(214,20%,70%)] transition-colors hover:text-white"
              >
                {mode === 'signup' ? 'Already have an account? ' : 'New to Curatr? '}
                <span className="font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-[hsl(155,100%,67%)]">
                  {mode === 'signup' ? 'Sign in' : 'Create an account'}
                </span>
              </button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
