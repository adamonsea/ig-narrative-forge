import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { DuplicateDetection } from '@/components/DuplicateDetection';
import { DuplicateCleanup } from '@/components/DuplicateCleanup';
import ErrorTicketDashboard from '@/components/ErrorTicketDashboard';
import { UnifiedSourceManager } from '@/components/UnifiedSourceManager';
import { SourceHealthDashboard } from '@/components/SourceHealthDashboard';
import { UnifiedTestingDashboard } from '@/components/UnifiedTestingDashboard';
import { CleanSlateMigration } from '@/components/CleanSlateMigration';
import { TopicArchiveManager } from '@/components/TopicArchiveManager';
export default function AdminPanel() {
  const { user, loading } = useAuth();

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
            <Button variant="outline" size="sm" asChild>
              <Link to="/dashboard">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Dashboard
              </Link>
            </Button>
          </div>
          <h1 className="text-3xl font-bold">Admin Panel</h1>
          <p className="text-muted-foreground">Manage system-wide settings and monitor platform health</p>
        </div>

        <Tabs defaultValue="sources" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="sources">Source Management</TabsTrigger>
            <TabsTrigger value="testing">Testing</TabsTrigger>
            <TabsTrigger value="archive">Topic Archive</TabsTrigger>
            <TabsTrigger value="migration">Clean Migration</TabsTrigger>
          </TabsList>
          
          <TabsContent value="sources" className="mt-6">
            <UnifiedSourceManager 
              mode="global"
              onSourcesChange={() => {}}
              title="Global Source Management"
              description="Manage all content sources across the platform with enhanced validation and health monitoring"
            />
          </TabsContent>

          <TabsContent value="testing" className="mt-6">
            <UnifiedTestingDashboard />
          </TabsContent>
          
          <TabsContent value="archive" className="mt-6">
            <TopicArchiveManager />
          </TabsContent>
          
          <TabsContent value="migration" className="mt-6">
            <CleanSlateMigration />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}