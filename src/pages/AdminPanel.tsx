import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { UnifiedSourceManager } from '@/components/UnifiedSourceManager';
import { QueueManager } from '@/components/QueueManager';
import { AutomationDashboard } from '@/components/AutomationDashboard';
import { supabase } from '@/integrations/supabase/client';
import { usePageFavicon } from '@/hooks/usePageFavicon';

export default function AdminPanel() {
  const { user, loading } = useAuth();
  
  // Set Curatr favicon for admin panel
  usePageFavicon();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link to="/dashboard" className="flex-shrink-0">
              <img 
                src="/curatr-icon.png" 
                alt="Curatr" 
                className="w-12 h-12 rounded-lg"
              />
            </Link>
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold text-foreground">Admin Panel</h1>
          <p className="text-muted-foreground">
            Manage system-wide settings and monitor platform health
            <span className="text-xs ml-2 opacity-60">• Powered by Curatr.pro</span>
          </p>
        </div>

        <Tabs defaultValue="sources" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sources">Source Management</TabsTrigger>
            <TabsTrigger value="queue">Queue Manager</TabsTrigger>
            <TabsTrigger value="automation">Topic Automation</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sources" className="mt-6">
            <UnifiedSourceManager 
              mode="global"
              onSourcesChange={() => {}}
              title="Global Source Management"
              description="Manage all content sources across the platform with enhanced validation and health monitoring"
            />
          </TabsContent>

          <TabsContent value="queue" className="mt-6">
            <QueueManager />
            <div className="mt-6">
              <div className="bg-card rounded-lg border p-6">
                <h3 className="text-lg font-semibold mb-4">Multi-Tenant Story Linkage</h3>
                <p className="text-muted-foreground mb-4">
                  Repair existing stories that lack proper multi-tenant linkage (topic_article_id and shared_content_id).
                </p>
                <button 
                  className="px-4 py-2 bg-primary text-primary-foreground rounded hover:bg-primary/90"
                  onClick={async () => {
                    try {
                      const { data, error } = await supabase.functions.invoke('backfill-story-linkage');
                      if (error) throw error;
                      alert(`Backfill complete! Updated ${data.updated} stories out of ${data.processed} processed.`);
                    } catch (error) {
                      console.error('Backfill failed:', error);
                      alert('Backfill failed: ' + error.message);
                    }
                  }}
                >
                  Run Story Linkage Backfill
                </button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="automation" className="mt-6">
            <AutomationDashboard />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}