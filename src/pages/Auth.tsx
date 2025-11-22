import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { usePageFavicon } from '@/hooks/usePageFavicon';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [waitlistLoading, setWaitlistLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();
  
  // Set Curatr favicon for auth page
  usePageFavicon();

  useEffect(() => {
    // Check if user is already logged in
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        navigate('/');
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
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-3">
          <div className="text-3xl font-display font-semibold tracking-tight text-foreground">
            Curatr<span className="text-xl opacity-70">.pro</span>
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
    </div>
  );
};

export default Auth;