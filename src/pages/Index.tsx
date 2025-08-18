import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle, Clock, LogOut, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { AdminPanel } from '@/components/AdminPanel';

const Index = () => {
  const { user, loading, signOut, isAdmin } = useAuth();
  const [systemHealth, setSystemHealth] = useState<any>(null);
  const [showAdmin, setShowAdmin] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    checkSystemHealth();
  }, []);

  const checkSystemHealth = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('health-check');
      if (error) throw error;
      setSystemHealth(data);
    } catch (error) {
      console.error('Failed to fetch system health:', error);
      toast({
        title: "Health Check Failed",
        description: "Unable to fetch system status",
        variant: "destructive",
      });
    }
  };

  const handleSignOut = async () => {
    await signOut();
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
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-4xl font-bold gradient-text">News → Social Slides</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              {user?.email}
              {isAdmin && <Badge variant="secondary" className="ml-2">Admin</Badge>}
            </span>
            {isAdmin && (
              <Button 
                onClick={() => setShowAdmin(!showAdmin)} 
                variant={showAdmin ? "default" : "outline"}
                size="sm"
              >
                <Settings className="h-4 w-4 mr-2" />
                Admin
              </Button>
            )}
            <Button onClick={handleSignOut} variant="outline" size="sm">
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>

        {showAdmin && isAdmin ? (
          <AdminPanel />
        ) : (
          <>
            {/* System Health Status */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  System Health
                  {systemHealth?.status === 'healthy' ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      <Badge variant={systemHealth?.status === 'healthy' ? 'default' : 'destructive'}>
                        {systemHealth?.status || 'Checking...'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Overall Status</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      <Badge variant={systemHealth?.services?.database === 'up' ? 'default' : 'destructive'}>
                        {systemHealth?.services?.database || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Database</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold">
                      <Badge variant={systemHealth?.services?.job_queue === 'up' ? 'default' : 'destructive'}>
                        {systemHealth?.services?.job_queue || 'Unknown'}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">Job Queue</p>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-2xl font-bold">{systemHealth?.pending_jobs || 0}</div>
                    <p className="text-sm text-muted-foreground">Pending Jobs</p>
                  </div>
                </div>
                
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs text-muted-foreground">
                    Last checked: {systemHealth?.timestamp ? 
                      new Date(systemHealth.timestamp).toLocaleString() : 
                      'Never'
                    }
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Ingest News</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Pull latest stories from RSS feeds and news APIs
                  </p>
                  <Button className="w-full" disabled>
                    Coming Soon
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Generate Slides</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    AI-powered conversion of news into social media slides
                  </p>
                  <Button className="w-full" disabled>
                    Coming Soon
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Publish Content</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Schedule and publish to social platforms via Buffer
                  </p>
                  <Button className="w-full" disabled>
                    Coming Soon
                  </Button>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Index;
