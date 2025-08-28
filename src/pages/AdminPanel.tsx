import React from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import FeedCTAManager from '@/components/admin/FeedCTAManager';

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
          <p className="text-muted-foreground">Manage your eeZee News configuration</p>
        </div>

        <Tabs defaultValue="cta" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="cta">Feed CTA Settings</TabsTrigger>
            <TabsTrigger value="other">Other Settings</TabsTrigger>
          </TabsList>
          
          <TabsContent value="cta" className="mt-6">
            <FeedCTAManager />
          </TabsContent>
          
          <TabsContent value="other" className="mt-6">
            <div className="text-center text-muted-foreground p-8">
              Additional admin features coming soon...
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}