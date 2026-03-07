import React from 'react';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { QueueManager } from '@/components/QueueManager';
import { SourceCleanup } from '@/components/SourceCleanup';
import { LifecycleAudit } from '@/components/LifecycleAudit';
import { ABTestDashboard } from '@/components/admin/ABTestDashboard';
import { SectionLabel } from '@/components/ui/section-label';

export default function AdminPanel() {
  const { user, loading, isAdmin } = useAuth();
  usePageFavicon();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto py-8 space-y-8">
          <h1 className="text-3xl font-bold text-foreground">Admin</h1>

          <section>
            <SectionLabel>Experiments</SectionLabel>
            <ABTestDashboard />
          </section>

          <section>
            <SectionLabel>Operations</SectionLabel>
            <div className="space-y-6">
              <QueueManager />
              <LifecycleAudit />
              <SourceCleanup />
            </div>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
