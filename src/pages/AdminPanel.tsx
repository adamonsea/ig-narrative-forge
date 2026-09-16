import React from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '@/components/ui/spinner';
import { useAuth } from '@/hooks/useAuth';
import { Navigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { usePageFavicon } from '@/hooks/usePageFavicon';
import { QueueManager } from '@/components/QueueManager';
import { SourceCleanup } from '@/components/SourceCleanup';
import { SourceHealthMonitor } from '@/components/SourceHealthMonitor';
import { ImageGenerationMetricsPanel } from '@/components/ImageGenerationMetricsPanel';
import { ABTestDashboard } from '@/components/admin/ABTestDashboard';
import { WaitlistPanel } from '@/components/admin/WaitlistPanel';
import { McpEntitlementsPanel } from '@/components/admin/McpEntitlementsPanel';
import { SectionLabel } from '@/components/ui/section-label';
import { Disclosure } from '@/components/ui/editorial';

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
          <h1 className="display-heading text-3xl text-foreground">Admin</h1>

          <section>
            <SectionLabel>Operations</SectionLabel>
            <div className="space-y-6">
              <QueueManager />
              <SourceHealthMonitor />
              <ImageGenerationMetricsPanel />
              <p className="text-sm text-muted-foreground">
                <Link to="/admin/ai-costs" className="underline underline-offset-4 hover:text-foreground">
                  Open the full AI cost dashboard
                </Link>
              </p>
              <SourceCleanup />
            </div>
          </section>

          <section>
            <SectionLabel>Add-on access</SectionLabel>
            <McpEntitlementsPanel />
          </section>

          <section className="space-y-4 border-t pt-6">
            <Disclosure label="Experiments">
              <ABTestDashboard />
            </Disclosure>
            <Disclosure label="Waitlist">
              <WaitlistPanel />
            </Disclosure>
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
