import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { clearSupabaseAuthStorage } from '@/lib/authStorage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Set Curatr favicon for auth page
  usePageFavicon();

  // Check Supabase connectivity on mount
  // Any response (even 401/400) means the server IS reachable
  // Only network errors (fetch throws) mean disconnected
  useEffect(() => {
    const checkConnectivity = async () => {
      try {
        await fetch('https://fpoywkjgdapgjtdeooak.supabase.co/auth/v1/', {
          method: 'HEAD',
          mode: 'cors',
        });
        // If we get here, the server responded (regardless of status code)
        setIsConnected(true);
      } catch {
        // Network error — server is unreachable
        setIsConnected(false);
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
          description: "We'll notify you when Breefly is ready for you.",
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
      toast({
        title: "Sign in failed",
        description:
          msg === 'Failed to fetch'
            ? 'Network error reaching Supabase auth. Please disable ad-block/VPN and try again.'
            : msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
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
                  Be the first to know when Breefly opens up
                </p>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Connection status & Reset Session */}
      <div className="mt-4 flex flex-col items-center gap-2 text-sm text-muted-foreground">
        <div className="flex items-center gap-1.5">
          {isConnected === null ? (
            <span className="text-muted-foreground">Checking connection...</span>
          ) : isConnected ? (
            <>
              <Wifi className="h-4 w-4 text-green-500" />
              <span className="text-green-600">Connected to auth server</span>
            </>
          ) : (
            <>
              <WifiOff className="h-4 w-4 text-destructive" />
              <span className="text-destructive">Cannot reach auth server</span>
            </>
          )}
        </div>
        <button
          type="button"
          onClick={handleResetSession}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Having trouble? Reset session
        </button>
      </div>
    </div>
  );
};

export default Auth;