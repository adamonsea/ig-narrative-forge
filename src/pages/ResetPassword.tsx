import { useState, useEffect } from 'react';
import { Link } from '@/lib/router-compat';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, KeyRound } from 'lucide-react';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { CuratrLogo } from '@/components/brand/CuratrLogo';

// Matches the Auth page palette: deep navy canvas, violet glow, mint pill action.
const INK = 'hsl(214, 50%, 9%)';
const VIOLET = 'hsl(270, 100%, 68%)';
const MINT = 'hsl(155, 100%, 67%)';

const ResetPassword = () => {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);

  usePageFavicon();

  useEffect(() => {
    // Recovery links arrive with #access_token=...&type=recovery in the hash.
    // The Supabase client picks that up and fires PASSWORD_RECOVERY.
    const hash = window.location.hash;
    if (hash.includes('type=recovery')) {
      setReady(true);
      setChecking(false);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setReady(true);
        setChecking(false);
      }
    });

    // Give the client a moment to process the hash before giving up.
    const timer = window.setTimeout(() => setChecking(false), 3000);

    return () => {
      subscription.unsubscribe();
      window.clearTimeout(timer);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError("The passwords don't match — try again.");
      return;
    }

    setLoading(true);
    try {
      // Recovery session: no current_password needed.
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(typeof err?.message === 'string' ? err.message : 'Something went wrong.');
      setLoading(false);
    }
  };

  const inputClasses =
    'h-14 rounded-full border-white/10 bg-white/[0.04] px-6 text-base text-white placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-[hsl(270,100%,68%)] focus-visible:border-[hsl(270,100%,68%)]';

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-4" style={{ backgroundColor: INK }}>
      <Helmet>
        <title>Choose a new password | Curatr</title>
        <meta name="description" content="Choose a new password for your Curatr workspace." />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div
        aria-hidden
        className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full opacity-10 blur-[120px]"
        style={{ backgroundColor: VIOLET }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-40 h-96 w-96 rounded-full opacity-5 blur-[140px]"
        style={{ backgroundColor: MINT }}
      />

      <main className="relative z-10 w-full max-w-md">
        <div className="px-4 pb-10 pt-6">
          <div className="mb-10 text-center">
            <Link to="/" aria-label="Curatr home" className="flex justify-center transition-opacity hover:opacity-80">
              <CuratrLogo className="justify-center text-xl text-white" iconClassName="text-[#AD5CFF]" />
            </Link>
            <h1 className="font-display mt-6 text-4xl italic tracking-tight text-white">Choose a new password</h1>
          </div>

          {checking ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" style={{ color: MINT }} />
            </div>
          ) : ready ? (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="new-password" className="ml-4 text-xs font-medium uppercase tracking-wider text-white/40">
                  New password
                </Label>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className={inputClasses}
                  minLength={6}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password" className="ml-4 text-xs font-medium uppercase tracking-wider text-white/40">
                  Again
                </Label>
                <Input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="Same password again"
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
                Save new password
              </Button>
            </form>
          ) : (
            <div className="space-y-5 py-6 text-center">
              <KeyRound className="mx-auto h-9 w-9" style={{ color: MINT }} />
              <p className="text-base leading-relaxed text-[hsl(214,20%,70%)]">
                This reset link has expired or already been used. Request a fresh one and you'll be back in a moment.
              </p>
              <Link
                to="/auth"
                className="inline-block text-sm font-medium text-white underline decoration-white/20 underline-offset-4 hover:decoration-[hsl(155,100%,67%)]"
              >
                Back to sign in
              </Link>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ResetPassword;
