import React from 'react';
import { AICostDashboard } from '@/components/AICostDashboard';
import { AppLayout } from '@/components/AppLayout';

const AICostDashboardPage = () => {
  return (
    <AppLayout>
      <div className="container mx-auto py-6 px-4">
        <AICostDashboard />
      </div>
    </AppLayout>
  );
};

export default AICostDashboardPage;
