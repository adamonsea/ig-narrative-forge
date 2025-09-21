import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Database, Zap, TestTube, CheckCircle } from "lucide-react";

import { UnifiedContentPipeline } from "@/components/UnifiedContentPipeline";

interface Topic {
  id: string;
  name: string;
  description: string;
  slug: string;
  topic_type: 'regional' | 'keyword';
  keywords: string[];
  region?: string;
  is_public: boolean;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

interface SimpleMultiTenantTestInterfaceProps {
  selectedTopicId: string;
  topic: Topic;
}

export const SimpleMultiTenantTestInterface = ({ selectedTopicId, topic }: SimpleMultiTenantTestInterfaceProps) => {

  return (
    <div className="space-y-6">
      <Card className="border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5 text-blue-600" />
            Multi-Tenant Content Management
          </CardTitle>
          <CardDescription>
            Simplified testing interface using the current multi-tenant pipeline
          </CardDescription>
        </CardHeader>
      </Card>

      <UnifiedContentPipeline selectedTopicId={selectedTopicId} />
    </div>
  );
};