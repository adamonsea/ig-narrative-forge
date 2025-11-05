// ============================================================================
// Phase 4: Standardized Scraper Response Types
// ============================================================================

export interface ScraperSourceResult {
  sourceId: string;
  sourceName: string;
  success: boolean;
  error?: string;
  articlesFound: number;
  articlesScraped: number;
  articlesStored?: number;  // Actually stored (after rejections)
  articlesSkipped?: number;
  rejectedLowRelevance?: number;  // Rejected due to low relevance
  rejectedLowQuality?: number;  // Rejected due to low quality
  rejectedCompeting?: number;  // Rejected due to competing region
  executionTimeMs?: number;
  // Phase 1: Add fallback method tracking
  fallbackMethod?: string;
}

export interface ScraperResponse {
  success: boolean;
  status: 'success' | 'partial_success' | 'failure';
  message: string;
  summary: {
    totalSources: number;
    successfulSources: number;
    failedSources: number;
    totalArticlesFound: number;
    totalArticlesStored: number;
    totalArticlesSkipped: number;
    executionTimeMs: number;
  };
  sourceResults: ScraperSourceResult[];
  errors: string[];
  warnings: string[];
}

export class StandardizedScraperResponse {
  private response: ScraperResponse;

  constructor() {
    this.response = {
      success: false,
      status: 'failure',
      message: '',
      summary: {
        totalSources: 0,
        successfulSources: 0,
        failedSources: 0,
        totalArticlesFound: 0,
        totalArticlesStored: 0,
        totalArticlesSkipped: 0,
        executionTimeMs: 0
      },
      sourceResults: [],
      errors: [],
      warnings: []
    };
  }

  addSourceResult(result: ScraperSourceResult) {
    this.response.sourceResults.push(result);
    this.response.summary.totalSources++;
    
    if (result.success) {
      this.response.summary.successfulSources++;
    } else {
      this.response.summary.failedSources++;
    }
    
    this.response.summary.totalArticlesFound += result.articlesFound;
    this.response.summary.totalArticlesStored += (result.articlesStored || result.articlesScraped);  // Use stored if available
    this.response.summary.totalArticlesSkipped += (result.articlesSkipped || 0);
  }

  addError(error: string) {
    this.response.errors.push(error);
  }

  addWarning(warning: string) {
    this.response.warnings.push(warning);
  }

  setExecutionTime(startTime: number) {
    this.response.summary.executionTimeMs = Date.now() - startTime;
  }

  finalize(): ScraperResponse {
    const { successfulSources, failedSources, totalSources } = this.response.summary;
    
    // Determine status based on results
    if (successfulSources === 0) {
      this.response.status = 'failure';
      this.response.success = false;
      this.response.message = `All ${totalSources} sources failed`;
    } else if (failedSources === 0) {
      this.response.status = 'success';
      this.response.success = true;
      this.response.message = `All ${totalSources} sources completed successfully`;
    } else {
      this.response.status = 'partial_success';
      this.response.success = true; // Partial success is still considered success
      this.response.message = `${successfulSources}/${totalSources} sources completed with issues`;
    }

    // Add contextual message based on article counts
    if (this.response.summary.totalArticlesStored === 0 && successfulSources > 0) {
      this.response.message += ' (no new articles found)';
    } else if (this.response.summary.totalArticlesStored > 0) {
      this.response.message += ` (${this.response.summary.totalArticlesStored} articles stored)`;
    }

    return this.response;
  }

  toJSON(): string {
    return JSON.stringify(this.finalize());
  }
}

// Helper function to determine UI message tone based on status
export function getUIMessageTone(status: 'success' | 'partial_success' | 'failure') {
  switch (status) {
    case 'success':
      return {
        title: 'Scraping Complete',
        variant: 'default' as const,
        icon: '✅'
      };
    case 'partial_success':
      return {
        title: 'Scraping Completed with Warnings',
        variant: 'default' as const, // Neutral, not destructive
        icon: '⚠️'
      };
    case 'failure':
      return {
        title: 'Scraping Failed',
        variant: 'destructive' as const,
        icon: '❌'
      };
  }
}