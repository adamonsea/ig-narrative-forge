import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { supabase } from '@/integrations/supabase/client';
import { clearSupabaseAuthStorage } from '@/lib/authStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { RefreshCw, Wifi, WifiOff, AlertTriangle, Copy } from 'lucide-react';

type ConnectionStatus = 'checking' | 'connected' | 'cors_blocked' | 'unreachable';

type CheckResult = 'pending' | 'pass' | 'fail';

type AuthDiagnostics = {
  origin: string;
  supabaseUrl: string;
  reachability: CheckResult;
  corsNoHeaders: CheckResult;
  corsWithApikey: CheckResult;
  reachabilityError?: string;
  corsNoHeadersError?: string;
  corsWithApikeyError?: string;
};

const getSupabaseUrl = (): string => {
  const s = supabase as any;
  if (typeof s?.supabaseUrl === 'string' && s.supabaseUrl.length > 0) return s.supabaseUrl;
  return 'https://fpoywkjgdapgjtdeooak.supabase.co';
};

const getSupabaseAnonKey = (): string | undefined => {
  const s = supabase as any;
  if (typeof s?.supabaseKey === 'string' && s.supabaseKey.length > 0) return s.supabaseKey;
  return undefined;
};

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('checking');
  const [diagnostics, setDiagnostics] = useState<AuthDiagnostics>({
    origin: typeof window !== 'undefined' ? window.location.origin : '',
    supabaseUrl: getSupabaseUrl(),
    reachability: 'pending',
    corsNoHeaders: 'pending',
    corsWithApikey: 'pending',
  });

  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Set Curatr favicon for auth page
  usePageFavicon();

  // 3-check connectivity diagnostic
  useEffect(() => {
    const checkConnectivity = async () => {
      const supabaseUrl = getSupabaseUrl();
      const anonKey = getSupabaseAnonKey();

      setDiagnostics((d) => ({
        ...d,
        origin: typeof window !== 'undefined' ? window.location.origin : d.origin,
        supabaseUrl,
        reachability: 'pending',
        corsNoHeaders: 'pending',
        corsWithApikey: 'pending',
        reachabilityError: undefined,
        corsNoHeadersError: undefined,
        corsWithApikeyError: undefined,
      }));

      // Check A: Reachability (no-cors mode — just checks if host responds)
      let hostReachable = false;
      try {
        await fetch(`${supabaseUrl}/auth/v1/`, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
        hostReachable = true;
        setDiagnostics((d) => ({ ...d, reachability: 'pass' }));
      } catch (err) {
        setDiagnostics((d) => ({
          ...d,
          reachability: 'fail',
          reachabilityError: err instanceof Error ? err.message : String(err),
        }));
        setConnectionStatus('unreachable');
        return;
      }

      // Check B: CORS without apikey header (tests if origin is allowed at all)
      let corsNoHeadersOk = false;
      try {
        await fetch(`${supabaseUrl}/auth/v1/`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
        });
        corsNoHeadersOk = true;
        setDiagnostics((d) => ({ ...d, corsNoHeaders: 'pass' }));
      } catch (err) {
        setDiagnostics((d) => ({
          ...d,
          corsNoHeaders: 'fail',
          corsNoHeadersError: err instanceof Error ? err.message : String(err),
        }));
      }

      // Check C: CORS with apikey header (tests preflight/allowed headers)
      try {
        await fetch(`${supabaseUrl}/auth/v1/`, {
          method: 'GET',
          mode: 'cors',
          cache: 'no-store',
          headers: anonKey ? { apikey: anonKey } : undefined,
        });
        setDiagnostics((d) => ({ ...d, corsWithApikey: 'pass' }));
        setConnectionStatus('connected');
      } catch (err) {
        setDiagnostics((d) => ({
          ...d,
          corsWithApikey: 'fail',
          corsWithApikeyError: err instanceof Error ? err.message : String(err),
        }));
        // Determine final status
        if (!corsNoHeadersOk) {
          setConnectionStatus('cors_blocked');
        } else {
          // CORS works without headers but fails with apikey → preflight issue
          setConnectionStatus('cors_blocked');
        }
      }
    };

    checkConnectivity();
  }, []);

  const handleResetSession = () => {
    try {
      (supabase.auth as any).stopAutoRefresh?.();
    } catch {
      // ignore
    }
    clearSupabaseAuthStorage();
    toast({
      title: "Session cleared",
      description: "Please try signing in again.",
    });
    window.location.reload();
  };


  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;

        if (data.session) {
          navigate('/');
        }
      } catch (err) {
        // If refresh token is corrupted or the auth endpoint is unreachable,
        // avoid breaking the auth page; user can still sign in.
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

  const handleWaitlistSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waitlistEmail) return;
    
    setWaitlistLoading(true);
    
    try {
      const { data, error } = await supabase.functions.invoke('waitlist-signup', {
        body: { email: waitlistEmail }
      });

      if (error) {
        console.error('Waitlist signup error:', error);
        toast({
          title: "Waitlist signup failed",
          description: error.message || "Failed to join waitlist",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Welcome to the waitlist!",
          description: "We'll notify you when Curatr is ready for you.",
        });
        setWaitlistEmail('');
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      toast({
        title: "Waitlist signup failed",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setWaitlistLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`
        }
      });

      if (error) throw error;

      toast({
        title: "Account created!",
        description: "Please check your email for verification link.",
      });
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        console.log('Sign in successful, redirecting...');
        toast({
          title: "Welcome back!",
          description: "Successfully signed in.",
        });
        // Force a page refresh to ensure clean auth state
        window.location.href = '/';
      }
    } catch (error: any) {
      const msg = typeof error?.message === 'string' ? error.message : 'Unknown error';
      
      // Provide specific error messages based on connection status
      let description = msg;
      if (msg === 'Failed to fetch') {
        if (connectionStatus === 'cors_blocked') {
          description = 'Request blocked by browser (CORS/extension). Try incognito mode or disable ad-blockers.';
        } else if (connectionStatus === 'unreachable') {
          description = 'Cannot reach Supabase servers. Check your network connection or firewall.';
        } else {
          description = 'Network error. Please check your connection and try again.';
        }
      }
      
      toast({
        title: "Sign in failed",
        description,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <Helmet>
        <title>Sign In | Curatr</title>
        <meta name="description" content="Sign in to Curatr to access your personalized editorial dashboard and curated feeds." />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/auth`} />
      </Helmet>

      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="flex items-center justify-center gap-2 mb-1">
            <img 
              src="/curatr-icon.png" 
              alt="Curatr" 
              className="h-8 w-8"
            />
            <div className="text-3xl font-display font-semibold tracking-tight text-foreground">
              Curatr<span className="text-xl font-display font-light tracking-tight opacity-70">.pro</span>
            </div>
          </div>
          <div className="text-xs text-muted-foreground font-medium tracking-wider uppercase">
            Beta
          </div>
          <CardDescription className="text-base">
            Currently invite-only. Join our waitlist below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign In</TabsTrigger>
              <TabsTrigger value="waitlist">Join Waitlist</TabsTrigger>
            </TabsList>
            
            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="waitlist">
              <form onSubmit={handleWaitlistSignup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="waitlist-email">Email</Label>
                  <Input
                    id="waitlist-email"
                    type="email"
                    value={waitlistEmail}
                    onChange={(e) => setWaitlistEmail(e.target.value)}
                    placeholder="Enter your email"
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={waitlistLoading}>
                  {waitlistLoading ? 'Joining waitlist...' : 'Join Waitlist'}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  Be the first to know when Curatr opens up
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Connection diagnostics */}
      <div className="mt-4 flex flex-col items-center gap-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {connectionStatus === 'checking' && (
            <span className="text-muted-foreground">Checking connection...</span>
          )}
          {connectionStatus === 'connected' && (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-green-600">Connected to auth server</span>
            </>
          )}
          {connectionStatus === 'cors_blocked' && (
            <>
              <AlertTriangle className="h-4 w-4 text-yellow-500" />
              <span className="text-yellow-600">CORS blocked</span>
            </>
          )}
          {connectionStatus === 'unreachable' && (
            <>
              <WifiOff className="h-4 w-4 text-destructive" />
              <span className="text-destructive">Cannot reach auth server</span>
            </>
          )}
        </div>

        {/* Three-check breakdown */}
        <div className="text-xs font-mono bg-muted/50 rounded-md p-3 space-y-1 w-full max-w-md">
          <div className="flex justify-between">
            <span>Origin:</span>
            <span className="truncate ml-2">{diagnostics.origin || '—'}</span>
          </div>
          <div className="flex justify-between">
            <span>Supabase:</span>
            <span className="truncate ml-2">{diagnostics.supabaseUrl}</span>
          </div>
          <hr className="border-border my-2" />
          <div className="flex justify-between items-center">
            <span>A) Reachability:</span>
            <span className={diagnostics.reachability === 'pass' ? 'text-green-600' : diagnostics.reachability === 'fail' ? 'text-destructive' : 'text-muted-foreground'}>
              {diagnostics.reachability === 'pending' ? '...' : diagnostics.reachability.toUpperCase()}
            </span>
          </div>
          {diagnostics.reachabilityError && (
            <div className="text-destructive text-[10px] break-all">↳ {diagnostics.reachabilityError}</div>
          )}
          <div className="flex justify-between items-center">
            <span>B) CORS (no headers):</span>
            <span className={diagnostics.corsNoHeaders === 'pass' ? 'text-green-600' : diagnostics.corsNoHeaders === 'fail' ? 'text-destructive' : 'text-muted-foreground'}>
              {diagnostics.corsNoHeaders === 'pending' ? '...' : diagnostics.corsNoHeaders.toUpperCase()}
            </span>
          </div>
          {diagnostics.corsNoHeadersError && (
            <div className="text-destructive text-[10px] break-all">↳ {diagnostics.corsNoHeadersError}</div>
          )}
          <div className="flex justify-between items-center">
            <span>C) CORS (with apikey):</span>
            <span className={diagnostics.corsWithApikey === 'pass' ? 'text-green-600' : diagnostics.corsWithApikey === 'fail' ? 'text-destructive' : 'text-muted-foreground'}>
              {diagnostics.corsWithApikey === 'pending' ? '...' : diagnostics.corsWithApikey.toUpperCase()}
            </span>
          </div>
          {diagnostics.corsWithApikeyError && (
            <div className="text-destructive text-[10px] break-all">↳ {diagnostics.corsWithApikeyError}</div>
          )}
        </div>

        {/* Interpretation */}
        {connectionStatus === 'cors_blocked' && diagnostics.corsNoHeaders === 'fail' && (
          <p className="text-xs text-yellow-600 text-center max-w-xs">
            <strong>Origin blocked:</strong> Your origin is not in Supabase's allowed list. Check <strong>Authentication → URL Configuration</strong> in Supabase Dashboard.
          </p>
        )}
        {connectionStatus === 'cors_blocked' && diagnostics.corsNoHeaders === 'pass' && diagnostics.corsWithApikey === 'fail' && (
          <p className="text-xs text-yellow-600 text-center max-w-xs">
            <strong>Preflight issue:</strong> Origin is allowed, but the <code>apikey</code> header is being rejected. Check custom domain/gateway settings.
          </p>
        )}

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              const payload = {
                origin: diagnostics.origin,
                supabaseUrl: diagnostics.supabaseUrl,
                status: connectionStatus,
                checks: {
                  reachability: diagnostics.reachability,
                  corsNoHeaders: diagnostics.corsNoHeaders,
                  corsWithApikey: diagnostics.corsWithApikey,
                },
                errors: {
                  reachability: diagnostics.reachabilityError,
                  corsNoHeaders: diagnostics.corsNoHeadersError,
                  corsWithApikey: diagnostics.corsWithApikeyError,
                },
              };
              try {
                await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
                toast({ title: 'Copied diagnostics', description: 'Paste this into chat.' });
              } catch {
                toast({ title: 'Copy failed', variant: 'destructive' });
              }
            }}
          >
            <Copy className="h-4 w-4" />
            Copy diagnostics
          </Button>

          <button
            type="button"
            onClick={handleResetSession}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3 w-3" />
            Reset session
          </button>
        </div>
      </div>
    </div>
  );
};

export default Auth;