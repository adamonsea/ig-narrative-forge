import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, TestTube, Camera, Globe, Wrench } from 'lucide-react';
import { TestingSuite } from '@/components/TestingSuite';
import { ScreenshotScraperTester } from '@/components/ScreenshotScraperTester';
import { MinimalScreenshotTester } from '@/components/MinimalScreenshotTester';
import MultiTenantScraperTester from '@/components/MultiTenantScraperTester';
import { useToast } from '@/hooks/use-toast';

interface TestResults {
  systemTests: number;
  scraperTests: number;
  screenshotTests: number;
  totalTests: number;
  passRate: number;
}

export const UnifiedTestingDashboard = () => {
  const [testResults, setTestResults] = useState<TestResults>({
    systemTests: 0,
    scraperTests: 0,
    screenshotTests: 0,
    totalTests: 0,
    passRate: 0
  });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const { toast } = useToast();

  const refreshTestResults = async () => {
    setIsRefreshing(true);
    try {
      // This would typically fetch actual test results from the backend
      // For now, we'll simulate the refresh
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Mock test results - in production this would come from actual test runs
      setTestResults({
        systemTests: 7,
        scraperTests: 4,
        screenshotTests: 1,
        totalTests: 12,
        passRate: 92
      });

      toast({
        title: "Test Results Refreshed",
        description: "Latest test results have been loaded",
      });
    } catch (error) {
      toast({
        title: "Refresh Failed",
        description: "Could not refresh test results",
        variant: "destructive",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Overview Dashboard */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <TestTube className="w-5 h-5" />
                Unified Testing Dashboard
                <Badge variant="secondary">Phase 1</Badge>
              </CardTitle>
              <CardDescription>
                Comprehensive testing suite for multi-tenant architecture and enhanced scraping capabilities
              </CardDescription>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={refreshTestResults}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh Results
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-primary">{testResults.systemTests}</div>
              <div className="text-sm text-muted-foreground">System Tests</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{testResults.scraperTests}</div>
              <div className="text-sm text-muted-foreground">Scraper Tests</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{testResults.screenshotTests}</div>
              <div className="text-sm text-muted-foreground">Screenshot Tests</div>
            </div>
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{testResults.passRate}%</div>
              <div className="text-sm text-muted-foreground">Pass Rate</div>
            </div>
          </div>
          
          <Alert className="mt-4">
            <TestTube className="w-4 h-4" />
            <AlertDescription>
              <strong>Phase 1 Focus:</strong> Integration testing for screenshot scraper, 
              multi-tenant architecture validation, and automated test scheduling setup.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* Testing Tabs */}
      <Tabs defaultValue="system" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="system" className="flex items-center gap-2">
            <Wrench className="w-4 h-4" />
            System Tests
          </TabsTrigger>
          <TabsTrigger value="scraper" className="flex items-center gap-2">
            <Globe className="w-4 h-4" />
            Multi-Tenant Scraper
          </TabsTrigger>
          <TabsTrigger value="screenshot" className="flex items-center gap-2">
            <Camera className="w-4 h-4" />
            Screenshot AI
          </TabsTrigger>
          <TabsTrigger value="debug" className="flex items-center gap-2">
            <TestTube className="w-4 h-4" />
            Debug Test
          </TabsTrigger>
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <TestTube className="w-4 h-4" />
            Test Overview
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="system" className="mt-6">
          <TestingSuite />
        </TabsContent>
        
        <TabsContent value="scraper" className="mt-6">
          <MultiTenantScraperTester />
        </TabsContent>
        
        <TabsContent value="screenshot" className="mt-6">
          <ScreenshotScraperTester />
        </TabsContent>
        
        <TabsContent value="debug" className="mt-6">
          <MinimalScreenshotTester />
        </TabsContent>
        
        <TabsContent value="overview" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Test Results Summary</CardTitle>
              <CardDescription>
                Comprehensive overview of all testing components and their current status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Wrench className="w-4 h-4" />
                    System Testing
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Database connectivity, data validation, search functionality, and core system operations.
                  </p>
                  <Badge variant="outline">7 Tests Available</Badge>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Multi-Tenant Scraper
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    Testing the new multi-tenant scraping architecture with Hastings region sources.
                  </p>
                  <Badge variant="outline">4 Sources Active</Badge>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Camera className="w-4 h-4" />
                    Screenshot AI Scraper
                  </h4>
                  <p className="text-sm text-muted-foreground mb-2">
                    AI-powered content extraction using OpenAI Vision for blocked sites.
                  </p>
                  <Badge variant="outline">OpenAI Vision</Badge>
                </div>
              </div>
              
              <Alert>
                <TestTube className="w-4 h-4" />
                <AlertDescription>
                  <strong>Next Steps:</strong> Phase 2 will add automated test scheduling, 
                  comprehensive regression testing, and production monitoring integration.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};