import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle, XCircle, Info, Zap } from "lucide-react";

const RegionalScraperDebugPanel = () => {
  const phase2Status = {
    multiTenantDbUpdated: true,
    legacyDbUpdated: true,
    fastTrackScraperUpdated: true,
    enhancedStrategiesUpdated: true,
    allLenientFallbacksRemoved: true
  };

  const phase2Changes = [
    {
      component: "multi-tenant-database-operations.ts",
      change: "Added strict 7-day pre-filtering before processing",
      status: "completed",
      impact: "Articles older than 7 days rejected immediately"
    },
    {
      component: "database-operations.ts", 
      change: "Removed lenient date parsing fallbacks",
      status: "completed",
      impact: "No more invalid dates accepted as 'current'"
    },
    {
      component: "fast-track-scraper.ts",
      change: "Added 7-day recency check in isFastQualified",
      status: "completed", 
      impact: "Fast extraction rejects old articles upfront"
    },
    {
      component: "enhanced-scraping-strategies.ts",
      change: "Strict date validation in article/content qualification",
      status: "completed",
      impact: "Emergency permissive mode replaced with proper filtering"
    }
  const phase1Changes = [
    {
      component: "scraperUtils.ts",
      change: "Regional topics now route to universal-topic-scraper",
      status: "completed",
      impact: "All regional topics use single entry point"
    },
    {
      component: "universal-topic-scraper",
      change: "Enhanced to support single source filtering",
      status: "completed", 
      impact: "Can scrape individual sources within topics"
    },
    {
      component: "UnifiedSourceManager",
      change: "Uses standardized scraper routing",
      status: "completed",
      impact: "Consistent scraper selection across UI"
    },
    {
      component: "MultiTenantScraperTester",
      change: "Updated to use universal-topic-scraper",
      status: "completed",
      impact: "Testing uses same path as production"
    }
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="w-5 h-5 text-blue-500" />
            Phase 1: Regional Scraper Standardization
          </CardTitle>
          <CardDescription>
            All regional topics now use universal-topic-scraper as single entry point
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              <strong>Phase 1 Complete:</strong> Regional scraping is now standardized to use universal-topic-scraper for all operations. 
              Individual source scraping and topic-level scraping now use the same consistent path.
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Changes Implemented</h4>
            {phase1Changes.map((change, index) => (
              <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-sm">{change.component}</span>
                    <Badge variant="outline" className="text-xs">
                      {change.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-1">{change.change}</p>
                  <p className="text-xs text-blue-600">{change.impact}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="font-medium text-green-800">Phase 2 Complete: 7-Day Strict Filtering</span>
            </div>
            <p className="text-sm text-green-700 mb-3">
              All scraper functions now enforce strict 7-day recency. No more lenient date parsing fallbacks that allowed old articles through.
            </p>
            
            <div className="space-y-2">
              <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Phase 2 Changes</h4>
              {phase2Changes.map((change, index) => (
                <div key={index} className="flex items-start gap-2 text-xs">
                  <CheckCircle className="w-3 h-3 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-medium">{change.component}:</span> {change.change}
                  </div>
                </div>
              ))}
            </div>
            
            <p className="text-sm text-green-700 mt-3">
              ✅ Ready for Phase 3: Prevent deleted items from reappearing
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default RegionalScraperDebugPanel;