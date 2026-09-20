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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-0 border-border bg-card p-0 shadow-2xl sm:max-w-md sm:rounded-lg">
        {checkEmail ? (
          <div className="space-y-5 px-6 py-10 text-center sm:px-10">
            <div className="font-logo text-xl text-foreground" aria-label="Curatr">
              Curatr<span className="text-muted-foreground">.pro</span>
            </div>
            <MailCheck className="mx-auto h-9 w-9 text-primary" />
            <DialogTitle className="text-2xl font-medium">Check your email</DialogTitle>
            <p className="text-base leading-relaxed text-muted-foreground">
              We've sent a confirmation link to <strong>{email}</strong>. Open it and your feed
              <strong> {blueprint?.feed_title}</strong> will be waiting, ready to build.
            </p>
            <Button className="h-12 w-full text-base" onClick={() => onOpenChange(false)}>Got it</Button>
          </div>
        ) : (
          <div className="px-6 pb-7 pt-8 sm:px-10 sm:pb-9 sm:pt-10">
            <div className="mb-8 font-logo text-xl text-foreground" aria-label="Curatr">
              Curatr<span className="text-muted-foreground">.pro</span>
            </div>

            <DialogHeader className="space-y-2 text-left">
              <DialogTitle className="text-2xl font-medium leading-tight">Save your feed</DialogTitle>
              <DialogDescription className="text-base leading-relaxed">
                {blueprint
                  ? `Create an account to build “${blueprint.feed_title}”.`
                  : 'Create an account to start building.'}
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="mt-7 space-y-5">
              <div className="space-y-2.5">
                <Label htmlFor="bp-email">Email</Label>
                <Input
                  id="bp-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="h-12"
                  required
                />
              </div>
              <div className="space-y-2.5">
                <Label htmlFor="bp-password">Password</Label>
                <Input
                  id="bp-password"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                  className="h-12"
                  minLength={6}
                  required
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <Button type="submit" className="h-12 w-full text-base" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === 'signup' ? 'Create account' : 'Sign in'}
              </Button>

              <Button
                type="button"
                variant="link"
                className="h-auto w-full p-0 text-base font-normal text-muted-foreground"
                onClick={() => {
                  setError(null);
                  setMode(mode === 'signup' ? 'signin' : 'signup');
                }}
              >
                {mode === 'signup' ? 'Already have an account? Sign in' : 'New to Curatr? Create an account'}
              </Button>
            </form>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
