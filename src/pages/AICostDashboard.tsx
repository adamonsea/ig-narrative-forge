import React from 'react';
import { AICostDashboard } from '@/components/AICostDashboard';
import { AppLayout } from '@/components/AppLayout';
import { AdminBillingPanel } from '@/components/billing/AdminBillingPanel';

const AICostDashboardPage = () => {
  return (
    <AppLayout>
      <div className="container mx-auto space-y-8 py-6 px-4">
        <AdminBillingPanel />
        <AICostDashboard />
      </div>
    </AppLayout>
  );
};

export default AICostDashboardPage;
