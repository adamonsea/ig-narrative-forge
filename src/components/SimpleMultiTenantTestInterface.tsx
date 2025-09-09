import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertTriangle, Database, Zap, TestTube, CheckCircle } from "lucide-react";

import { HybridTopicPipeline } from "@/components/HybridTopicPipeline";
import { TopicAwareContentPipeline } from "@/components/TopicAwareContentPipeline";

import { useMultiTenantTopicPipeline } from "@/hooks/useMultiTenantTopicPipeline";
import { useTopicPipeline } from "@/hooks/useTopicPipeline";

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
  const [useMultiTenant, setUseMultiTenant] = useState(true);
  const [comparisonMode, setComparisonMode] = useState(false);

  // Multi-tenant hooks
  const {
    articles: multiTenantArticles,
    queueItems: multiTenantQueue,
    stories: multiTenantStories,
    stats: multiTenantStats,
    loading: multiTenantLoading,
    loadTopicContent: reloadMultiTenant,
    testMigration,
    migrateTopicArticles
  } = useMultiTenantTopicPipeline(selectedTopicId);

  // Legacy hooks
  const {
    articles: legacyArticles,
    queueItems: legacyQueue,
    stories: legacyStories,
    stats: legacyStats,
    loading: legacyLoading,
    loadTopicContent: reloadLegacy
  } = useTopicPipeline(selectedTopicId);

  const [migrationInfo, setMigrationInfo] = useState<{legacy: number, multiTenant: number} | null>(null);

  useEffect(() => {
    if (selectedTopicId) {
      testMigration().then(setMigrationInfo);
    }
  }, [selectedTopicId, testMigration]);

  const handleMigration = async () => {
    await migrateTopicArticles();
    const newInfo = await testMigration();
    setMigrationInfo(newInfo);
  };

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card className="border-2 border-dashed border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TestTube className="h-5 w-5 text-blue-600" />
            Legacy vs Multi-Tenant Testing Interface
          </CardTitle>
          <CardDescription>
            Switch between legacy and multi-tenant systems to test functionality before migration
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Migration Status */}
          {migrationInfo && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <Database className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="text-sm font-medium">Legacy Articles</div>
                  <div className="text-2xl font-bold text-orange-600">{migrationInfo.legacy}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-green-500" />
                <div>
                  <div className="text-sm font-medium">Multi-Tenant Articles</div>
                  <div className="text-2xl font-bold text-green-600">{migrationInfo.multiTenant}</div>
                </div>
              </div>
              <div className="flex items-center justify-center">
                <Button onClick={handleMigration} variant="outline" size="sm">
                  Migrate Articles
                </Button>
              </div>
            </div>
          )}

          <Separator />

          {/* Mode Controls */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="flex items-center space-x-2">
              <Switch
                id="system-mode"
                checked={useMultiTenant}
                onCheckedChange={setUseMultiTenant}
              />
              <Label htmlFor="system-mode" className="flex items-center gap-2">
                {useMultiTenant ? (
                  <>
                    <Zap className="h-4 w-4 text-green-500" />
                    Multi-Tenant System
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 text-orange-500" />
                    Legacy System
                  </>
                )}
              </Label>
            </div>

            <div className="flex items-center space-x-2">
              <Switch
                id="comparison-mode"
                checked={comparisonMode}
                onCheckedChange={setComparisonMode}
              />
              <Label htmlFor="comparison-mode" className="flex items-center gap-2">
                <TestTube className="h-4 w-4 text-blue-500" />
                Side-by-Side Comparison
              </Label>
            </div>
          </div>

          {/* System Status */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-orange-200 dark:border-orange-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-orange-500" />
                    <span className="font-medium">Legacy System</span>
                  </div>
                  <Badge variant="secondary">
                    {legacyArticles.length} articles
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Zap className="h-4 w-4 text-green-500" />
                    <span className="font-medium">Multi-Tenant System</span>
                  </div>
                  <Badge variant="secondary">
                    {multiTenantStats.totalArticles} articles
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* Content Display */}
      {comparisonMode ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Legacy System */}
          <Card className="border-orange-200 dark:border-orange-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5 text-orange-500" />
                Legacy System
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TopicAwareContentPipeline 
                selectedTopicId={selectedTopicId}
              />
            </CardContent>
          </Card>

          {/* Multi-Tenant System */}
          <Card className="border-green-200 dark:border-green-800">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-green-500" />
                Multi-Tenant System
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HybridTopicPipeline 
                selectedTopicId={selectedTopicId}
                topic={topic}
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        /* Single System View */
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {useMultiTenant ? (
                <>
                  <Zap className="h-5 w-5 text-green-500" />
                  Multi-Tenant Content Pipeline
                </>
              ) : (
                <>
                  <Database className="h-5 w-5 text-orange-500" />
                  Legacy Content Pipeline
                </>
              )}
            </CardTitle>
            <CardDescription>
              {useMultiTenant 
                ? "New multi-tenant architecture with shared content and topic-specific relevance"
                : "Traditional single-topic article management system"
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {useMultiTenant ? (
              <HybridTopicPipeline 
                selectedTopicId={selectedTopicId}
                topic={topic}
              />
            ) : (
              <TopicAwareContentPipeline 
                selectedTopicId={selectedTopicId}
              />
            )}
          </CardContent>
        </Card>
      )}

      {/* Performance Metrics */}
      <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            System Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-orange-600">{legacyArticles.length}</div>
              <div className="text-sm text-muted-foreground">Legacy Articles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{multiTenantStats.totalArticles}</div>
              <div className="text-sm text-muted-foreground">Multi-Tenant Articles</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-orange-600">{legacyStats.ready_stories}</div>
              <div className="text-sm text-muted-foreground">Legacy Stories</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-600">{multiTenantStats.readyStories}</div>
              <div className="text-sm text-muted-foreground">Multi-Tenant Stories</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};