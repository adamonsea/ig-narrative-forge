import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@supabase/supabase-js';

const Index = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check authentication status
    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        navigate('/auth');
        return;
      }
      
      setUser(session.user);
      setLoading(false);
    };

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!session) {
          navigate('/auth');
          return;
        }
        setUser(session.user);
        setLoading(false);
      }
    );

    checkAuth();
    checkSystemHealth();

    return () => subscription.unsubscribe();
  }, [navigate]);

  const checkSystemHealth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('health-check');
      
      if (error) throw error;
      setHealthStatus(data);
    } catch (error) {
      console.error('Health check failed:', error);
      setHealthStatus({ overall_status: 'unhealthy', error: 'Failed to fetch' });
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
      toast({
        title: "Signed out",
        description: "You have been successfully signed out.",
      });
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold mb-2">IG Narrative Forge</h1>
            <p className="text-lg text-muted-foreground">
              Transform local news into engaging social media content
            </p>
          </div>
          <div className="flex items-center gap-4">
            <Badge variant="outline">
              System: {healthStatus?.overall_status === 'healthy' ? 'Online' : 'Issues'}
            </Badge>
            <Button variant="outline" onClick={handleSignOut}>
              Sign Out
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {/* Phase 0 Complete Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Phase 0: Infrastructure ✅</CardTitle>
              <CardDescription>Plumbing & Safety Foundation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Security (RLS)</span>
                  <Badge variant="default">Complete</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Job System</span>
                  <Badge variant="default">Complete</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Monitoring</span>
                  <Badge variant="default">Complete</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Storage Buckets</span>
                  <Badge variant="default">Complete</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Health */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">System Health</CardTitle>
              <CardDescription>Real-time system status</CardDescription>
            </CardHeader>
            <CardContent>
              {healthStatus ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Database</span>
                    <Badge variant={healthStatus.services?.database?.status === 'healthy' ? 'default' : 'destructive'}>
                      {healthStatus.services?.database?.status || 'Unknown'}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Job Queue</span>
                    <Badge variant={healthStatus.services?.job_queue?.status === 'healthy' ? 'default' : 'destructive'}>
                      {healthStatus.services?.job_queue?.pending_jobs || 0} pending
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Error Rate</span>
                    <Badge variant={
                      (healthStatus.services?.error_rate?.recent_errors || 0) > 10 ? 'destructive' : 'default'
                    }>
                      {healthStatus.services?.error_rate?.recent_errors || 0} errors/hr
                    </Badge>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">Loading health status...</div>
              )}
            </CardContent>
          </Card>

          {/* Next Phase */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Next: Phase 1</CardTitle>
              <CardDescription>Content Management Interface</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Dashboard Layout</span>
                  <Badge variant="outline">Pending</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Article Import</span>
                  <Badge variant="outline">Pending</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm">Content Search</span>
                  <Badge variant="outline">Pending</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Feature Flags Status */}
        <Card>
          <CardHeader>
            <CardTitle>Feature Flags</CardTitle>
            <CardDescription>
              Current feature flag configuration for the platform
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex flex-col items-center p-3 rounded-lg border">
                <Badge variant="default" className="mb-2">Visual Generation</Badge>
                <span className="text-sm text-muted-foreground">Enabled</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg border">
                <Badge variant="secondary" className="mb-2">Sponsor Slots</Badge>
                <span className="text-sm text-muted-foreground">Disabled</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg border">
                <Badge variant="default" className="mb-2">Instagram</Badge>
                <span className="text-sm text-muted-foreground">Enabled</span>
              </div>
              <div className="flex flex-col items-center p-3 rounded-lg border">
                <Badge variant="default" className="mb-2">AI Filter</Badge>
                <span className="text-sm text-muted-foreground">Enabled</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Index;
