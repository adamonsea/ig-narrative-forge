// ============================================================================
// Phase 4: UI Helper Functions for Standardized Scraper Status Messaging
// ============================================================================

export type ScraperStatus = 'success' | 'partial_success' | 'failure';

export interface ScraperUIMessage {
  title: string;
  variant: 'default' | 'destructive';
  icon: string;
}

/**
 * Phase 4: Get neutral UI messaging based on standardized scraper status
 */
export function getScraperUIMessage(status: ScraperStatus): ScraperUIMessage {
  switch (status) {
    case 'success':
      return {
        title: 'Scraping Complete',
        variant: 'default',
        icon: '✅'
      };
    case 'partial_success':
      return {
        title: 'Scraping Completed with Warnings',
        variant: 'default', // Neutral, not destructive
        icon: '⚠️'
      };
    case 'failure':
      return {
        title: 'Scraping Failed',
        variant: 'destructive',
        icon: '❌'
      };
  }
}

/**
 * Phase 4: Create neutral toast message for scraper results
 */
export function createScraperToastMessage(
  status: ScraperStatus,
  sourceName: string,
  articlesFound: number = 0,
  articlesStored: number = 0,
  error?: string
) {
  const uiMessage = getScraperUIMessage(status);
  
  let description = '';
  if (status === 'success' && articlesStored > 0) {
    description = `${sourceName}: Found ${articlesFound}, stored ${articlesStored}`;
  } else if (status === 'partial_success') {
    description = `${sourceName}: Completed with warnings. ${articlesStored > 0 ? `Stored ${articlesStored} articles` : 'No new articles'}`;
  } else {
    description = `${sourceName}: ${error || 'No articles stored'}`;
  }

  return {
    title: uiMessage.title,
    description,
    variant: uiMessage.variant
  };
}

/**
 * Phase 4: Get summary message for multiple source results
 */
export function getMultiSourceSummary(
  totalSources: number,
  successfulSources: number,
  articlesStored: number
): { status: ScraperStatus; message: string } {
  if (successfulSources === 0) {
    return {
      status: 'failure',
      message: `All ${totalSources} sources failed`
    };
  } else if (successfulSources === totalSources) {
    return {
      status: 'success',
      message: `All ${totalSources} sources completed successfully${articlesStored > 0 ? ` (${articlesStored} articles)` : ' (no new articles)'}`
    };
  } else {
    return {
      status: 'partial_success',
      message: `${successfulSources}/${totalSources} sources completed with issues${articlesStored > 0 ? ` (${articlesStored} articles)` : ''}`
    };
  }
}