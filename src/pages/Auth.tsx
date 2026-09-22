import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { clearSupabaseAuthStorage } from '@/lib/authStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, MailCheck } from 'lucide-react';
import { usePageFavicon } from '@/hooks/usePageFavicon';

// Homepage ink palette: deep navy canvas, violet glow, mint pill action.
const INK = 'hsl(214, 50%, 9%)';
const VIOLET = 'hsl(270, 100%, 68%)';
const MINT = 'hsl(155, 100%, 67%)';

const safeRedirect = () => {
  const requested = new URLSearchParams(window.location.search).get('redirect');
  return requested && requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';
};

const Auth = () => {
  const [mode, setMode] = useState<'signup' | 'signin'>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const navigate = useNavigate();
  usePageFavicon();

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        if (data.session) navigate('/dashboard');
      } catch (err) {
        try {
          (supabase.auth as any).stopAutoRefresh?.();
        } catch {
          // ignore
        }
        clearSupabaseAuthStorage();
        console.warn('[Auth] getSession failed on /auth', err);
      }
    };
    checkUser();
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/dashboard` },
        });
        if (signUpError) throw signUpError;
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setMode('signin');
          setError('You already have an account with this email — sign in below.');
          return;
        }
        if (!data.session) {
          setCheckEmail(true);
          return;
        }
        window.location.href = safeRedirect();
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        window.location.href = safeRedirect();
      }
    } catch (err: any) {
      const message = typeof err?.message === 'string' ? err.message : 'Something went wrong.';
      setError(
        /already registered/i.test(message)
          ? 'You already have an account — switch to sign in below.'
          : message,
      );
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    setError(null);
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}${safeRedirect()}` },
    });
    if (oauthError) {
      setError(oauthError.message);
      setLoading(false);
    }
  };

  const inputClasses =
    'h-14 rounded-full border-white/10 bg-white/[0.04] px-6 text-base text-white placeholder:text-white/30 focus-visible:ring-1 focus-visible:ring-[hsl(270,100%,68%)] focus-visible:border-[hsl(270,100%,68%)]';

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden p-4" style={{ backgroundColor: INK }}>
      <Helmet>
        <title>{mode === 'signup' ? 'Create your workspace | Curatr' : 'Sign in | Curatr'}</title>
        <meta name="description" content="Create a Curatr workspace or sign in to build and curate your own niche news feeds." />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth`} />
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
        {checkEmail ? (
          <div className="space-y-5 px-4 py-12 text-center">
            <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Curatr.pro</div>
            <MailCheck className="mx-auto h-9 w-9" style={{ color: MINT }} />
            <h1 className="font-display text-3xl italic tracking-tight text-white">Check your email</h1>
            <p className="text-base leading-relaxed text-[hsl(214,20%,70%)]">
              We've sent a confirmation link to <strong className="text-white">{email}</strong>. Open it and your
              workspace will be ready.
            </p>
          </div>
        ) : (
          <div className="px-4 pb-10 pt-6">
            <div className="mb-10 text-center">
              <div className="text-xs font-bold uppercase tracking-[0.2em] text-white/40">Curatr.pro</div>
              <h1 className="font-display mt-6 text-4xl italic tracking-tight text-white">
                {mode === 'signup' ? 'Create your workspace' : 'Welcome back'}
              </h1>
              <p className="mt-3 text-sm text-[hsl(214,20%,70%)]">Free to create and curate.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <Button
                type="button"
                variant="outline"
                onClick={handleGoogle}
                disabled={loading}
                className="h-14 w-full rounded-full border-white/10 bg-white/[0.04] text-base font-medium text-white hover:bg-white/[0.08] hover:text-white"
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.57 5.57 0 0 1-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z" />
                  <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A11.99 11.99 0 0 0 12 24z" />
                  <path fill="#FBBC05" d="M5.27 14.29A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.29V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09z" />
                  <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42A11.97 11.97 0 0 0 12 0 11.99 11.99 0 0 0 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z" />
                </svg>
                Continue with Google
              </Button>

              <div className="flex items-center gap-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs uppercase tracking-wider text-white/30">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="space-y-2">
                <Label htmlFor="auth-email" className="ml-4 text-xs font-medium uppercase tracking-wider text-white/40">
                  Email
                </Label>
                <Input
                  id="auth-email"
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
                <Label htmlFor="auth-password" className="ml-4 text-xs font-medium uppercase tracking-wider text-white/40">
                  Password
                </Label>
                <Input
                  id="auth-password"
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
      </main>
    </div>
  );
};

export default Auth;
