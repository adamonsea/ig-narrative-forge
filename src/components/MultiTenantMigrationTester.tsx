import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useMultiTenantTopicPipeline } from "@/hooks/useMultiTenantTopicPipeline";
import { useTopicPipeline } from "@/hooks/useTopicPipeline";
import { RefreshCw, GitCompare, Database, TestTube } from "lucide-react";

interface MigrationTesterProps {
  selectedTopicId: string | null;
  topicName?: string;
}

export const MultiTenantMigrationTester = ({ selectedTopicId, topicName }: MigrationTesterProps) => {
  const [testing, setTesting] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const { toast } = useToast();

  // Use both old and new hooks for comparison
  const legacyPipeline = useTopicPipeline(selectedTopicId);
  const multiTenantPipeline = useMultiTenantTopicPipeline(selectedTopicId);

  const runMigrationTest = async () => {
    if (!selectedTopicId) return;

    setTesting(true);
    try {
      const result = await multiTenantPipeline.testMigration();
      setTestResult(result);
      
      if (result?.match) {
        toast({
          title: "Migration Test Passed",
          description: "Article counts match between old and new systems"
        });
      } else {
        toast({
          title: "Migration Test Warning", 
          description: `Count mismatch: Legacy=${result?.legacy}, Multi-tenant=${result?.multiTenant}`,
          variant: "destructive"
        });
      }
    } catch (error: any) {
      console.error('Test error:', error);
      toast({
        title: "Test Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  const runMigration = async () => {
    if (!selectedTopicId) return;

    setMigrating(true);
    try {
      await multiTenantPipeline.migrateTopicArticles();
      // Reload both pipelines
      await Promise.all([
        legacyPipeline.loadTopicContent(),
        multiTenantPipeline.loadTopicContent()
      ]);
    } catch (error: any) {
      console.error('Migration error:', error);
      toast({
        title: "Migration Failed",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setMigrating(false);
    }
  };

  const testScraping = async () => {
    if (!selectedTopicId) return;
    
    try {
      toast({
        title: "Testing Multi-Tenant Scraping",
        description: "Running test scrape with new system..."
      });

      // Call the new multi-tenant scraper with test data
      const { data, error } = await supabase.functions.invoke('multi-tenant-scraper', {
        body: {
          feedUrl: 'test-url',
          topicId: selectedTopicId,
          sourceId: null,
          articles: [
            {
              title: `Test Article - ${new Date().toISOString()}`,
              body: 'This is a test article to verify multi-tenant scraping functionality.',
              source_url: `https://test.example.com/article-${Date.now()}`,
              published_at: new Date().toISOString()
            }
          ]
        }
      });

      if (error) throw error;

      toast({
        title: "Scraping Test Complete",
        description: `Processed: ${data.articlesScraped} articles, Created: ${data.newContentCreated} content, Topic articles: ${data.topicArticlesCreated}`
      });

      // Reload both pipelines to see results
      await Promise.all([
        legacyPipeline.loadTopicContent(),
        multiTenantPipeline.loadTopicContent()
      ]);
      
    } catch (error: any) {
      console.error('Scraping test error:', error);
      toast({
        title: "Scraping Test Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  if (!selectedTopicId) {
    return (
      <Alert>
        <AlertDescription>
          Please select a topic to test multi-tenant migration.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="h-5 w-5" />
            Multi-Tenant Migration Tester
          </CardTitle>
          <CardDescription>
            Compare legacy and multi-tenant systems for topic: <strong>{topicName}</strong>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 mb-6">
            <Button
              onClick={runMigrationTest}
              disabled={testing}
              variant="outline"
            >
              {testing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <TestTube className="h-4 w-4 mr-2" />}
              Test Migration
            </Button>
            <Button
              onClick={runMigration}
              disabled={migrating}
            >
              {migrating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Database className="h-4 w-4 mr-2" />}
              Run Migration
            </Button>
            <Button
              onClick={testScraping}
              variant="secondary"
            >
              Test Multi-Tenant Scraping
            </Button>
          </div>

          {testResult && (
            <Alert className={testResult.match ? "" : "border-yellow-500"}>
              <AlertDescription>
                <strong>Migration Test Results:</strong>
                <br />
                Legacy Articles: {testResult.legacy}
                <br />
                Multi-Tenant Articles: {testResult.multiTenant}
                <br />
                Status: <Badge variant={testResult.match ? "default" : "destructive"}>
                  {testResult.match ? "✓ Match" : "✗ Mismatch"}
                </Badge>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="legacy" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="legacy">Legacy System</TabsTrigger>
          <TabsTrigger value="multi-tenant">Multi-Tenant System</TabsTrigger>
        </TabsList>

        <TabsContent value="legacy">
          <Card>
            <CardHeader>
              <CardTitle>Legacy Article Pipeline</CardTitle>
              <CardDescription>Current single-tenant system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{legacyPipeline.articles?.length || 0}</div>
                  <div className="text-sm text-muted-foreground">Total Articles</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{legacyPipeline.stats?.pending_articles || 0}</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{legacyPipeline.stats?.ready_stories || 0}</div>
                  <div className="text-sm text-muted-foreground">Ready Stories</div>
                </div>
              </div>
              
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {legacyPipeline.articles.slice(0, 10).map((article) => (
                  <div key={article.id} className="p-3 border rounded-lg">
                    <div className="font-medium text-sm">{article.title}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {article.processing_status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Score: {article.regional_relevance_score}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="multi-tenant">
          <Card>
            <CardHeader>
              <CardTitle>Multi-Tenant Article Pipeline</CardTitle>
              <CardDescription>New multi-tenant system</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{multiTenantPipeline.stats.totalArticles}</div>
                  <div className="text-sm text-muted-foreground">Total Articles</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{multiTenantPipeline.stats.pendingArticles}</div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold">{multiTenantPipeline.stats.processedArticles}</div>
                  <div className="text-sm text-muted-foreground">Processed</div>
                </div>
              </div>

              <div className="space-y-2 max-h-60 overflow-y-auto">
                {multiTenantPipeline.articles.slice(0, 10).map((article) => (
                  <div key={article.id} className="p-3 border rounded-lg">
                    <div className="font-medium text-sm">{article.title}</div>
                    <div className="flex gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {article.processing_status}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Score: {article.regional_relevance_score}
                      </Badge>
                      {article.keyword_matches && article.keyword_matches.length > 0 && (
                        <Badge variant="default" className="text-xs">
                          Keywords: {article.keyword_matches.length}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};