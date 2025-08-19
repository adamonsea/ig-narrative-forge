import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalyticsData {
  performance_metrics: {
    total_articles: number;
    total_stories: number;
    average_quality_score: number;
    processing_success_rate: number;
    regional_relevance_avg: number;
  };
  source_performance: Array<{
    source_name: string;
    articles_count: number;
    success_rate: number;
    avg_quality: number;
    last_scraped: string;
  }>;
  quality_trends: Array<{
    date: string;
    avg_quality: number;
    total_processed: number;
  }>;
  content_analysis: {
    top_keywords: Array<{ keyword: string; count: number }>;
    regional_distribution: Array<{ region: string; count: number }>;
    status_breakdown: Array<{ status: string; count: number }>;
  };
  recommendations: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Missing required environment variables');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const { timeframe = '7d', metrics = 'all' } = await req.json();

    console.log('Generating analytics dashboard data for timeframe:', timeframe);

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    
    switch (timeframe) {
      case '1d':
        startDate.setDate(endDate.getDate() - 1);
        break;
      case '7d':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 7);
    }

    // Gather comprehensive analytics data
    const analyticsData = await generateAnalyticsData(supabase, startDate, endDate);
    
    console.log('Analytics data generated successfully');

    return new Response(
      JSON.stringify({ 
        success: true, 
        timeframe,
        data: analyticsData,
        generated_at: new Date().toISOString()
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Error in analytics-dashboard function:', error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

async function generateAnalyticsData(supabase: any, startDate: Date, endDate: Date): Promise<AnalyticsData> {
  const dateFilter = `created_at.gte.${startDate.toISOString()}.and.created_at.lte.${endDate.toISOString()}`;
  
  // Performance Metrics
  const { data: articles } = await supabase
    .from('articles')
    .select('*')
    .filter('created_at', 'gte', startDate.toISOString())
    .filter('created_at', 'lte', endDate.toISOString());

  const { data: stories } = await supabase
    .from('stories')
    .select('*')
    .filter('created_at', 'gte', startDate.toISOString())
    .filter('created_at', 'lte', endDate.toISOString());

  const { data: qualityReports } = await supabase
    .from('quality_reports')
    .select('*')
    .filter('created_at', 'gte', startDate.toISOString())
    .filter('created_at', 'lte', endDate.toISOString());

  // Source Performance
  const { data: sources } = await supabase
    .from('content_sources')
    .select(`
      *,
      articles!inner(id, created_at)
    `)
    .filter('articles.created_at', 'gte', startDate.toISOString())
    .filter('articles.created_at', 'lte', endDate.toISOString());

  // Quality Trends (daily aggregation)
  const qualityTrends = await generateQualityTrends(supabase, startDate, endDate);

  // Content Analysis
  const contentAnalysis = await generateContentAnalysis(articles || [], stories || []);

  const performanceMetrics = {
    total_articles: articles?.length || 0,
    total_stories: stories?.length || 0,
    average_quality_score: qualityReports?.length > 0 
      ? qualityReports.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / qualityReports.length
      : 0,
    processing_success_rate: articles?.length > 0 
      ? ((stories?.length || 0) / articles.length) * 100 
      : 0,
    regional_relevance_avg: articles?.length > 0
      ? articles.reduce((sum: number, a: any) => sum + (a.import_metadata?.regional_relevance_score || 0), 0) / articles.length
      : 0
  };

  const sourcePerformance = (sources || []).map((source: any) => ({
    source_name: source.source_name,
    articles_count: source.articles?.length || 0,
    success_rate: source.success_rate || 0,
    avg_quality: 0, // Would calculate from related quality reports
    last_scraped: source.last_scraped_at || 'Never'
  })).filter(s => s.articles_count > 0);

  const recommendations = generateRecommendations(performanceMetrics, sourcePerformance, qualityReports || []);

  return {
    performance_metrics: performanceMetrics,
    source_performance: sourcePerformance,
    quality_trends: qualityTrends,
    content_analysis: contentAnalysis,
    recommendations: recommendations
  };
}

async function generateQualityTrends(supabase: any, startDate: Date, endDate: Date): Promise<Array<{date: string, avg_quality: number, total_processed: number}>> {
  const trends = [];
  const currentDate = new Date(startDate);
  
  while (currentDate <= endDate) {
    const dayStart = new Date(currentDate);
    const dayEnd = new Date(currentDate);
    dayEnd.setDate(dayEnd.getDate() + 1);
    
    const { data: dayReports } = await supabase
      .from('quality_reports')
      .select('overall_score')
      .filter('created_at', 'gte', dayStart.toISOString())
      .filter('created_at', 'lt', dayEnd.toISOString());
    
    const avgQuality = dayReports?.length > 0 
      ? dayReports.reduce((sum: number, r: any) => sum + (r.overall_score || 0), 0) / dayReports.length
      : 0;
    
    trends.push({
      date: currentDate.toISOString().split('T')[0],
      avg_quality: Math.round(avgQuality),
      total_processed: dayReports?.length || 0
    });
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return trends;
}

async function generateContentAnalysis(articles: any[], stories: any[]): Promise<{
  top_keywords: Array<{ keyword: string; count: number }>;
  regional_distribution: Array<{ region: string; count: number }>;
  status_breakdown: Array<{ status: string; count: number }>;
}> {
  // Keywords analysis
  const keywordCounts: Record<string, number> = {};
  articles.forEach(article => {
    if (article.keywords && Array.isArray(article.keywords)) {
      article.keywords.forEach((keyword: string) => {
        keywordCounts[keyword] = (keywordCounts[keyword] || 0) + 1;
      });
    }
  });
  
  const topKeywords = Object.entries(keywordCounts)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([keyword, count]) => ({ keyword, count }));

  // Regional distribution
  const regionCounts: Record<string, number> = {};
  articles.forEach(article => {
    const region = article.region || 'Unknown';
    regionCounts[region] = (regionCounts[region] || 0) + 1;
  });
  
  const regionalDistribution = Object.entries(regionCounts)
    .map(([region, count]) => ({ region, count }))
    .sort((a, b) => b.count - a.count);

  // Status breakdown
  const statusCounts: Record<string, number> = {};
  stories.forEach(story => {
    const status = story.status || 'unknown';
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });
  
  const statusBreakdown = Object.entries(statusCounts)
    .map(([status, count]) => ({ status, count }));

  return {
    top_keywords: topKeywords,
    regional_distribution: regionalDistribution,
    status_breakdown: statusBreakdown
  };
}

function generateRecommendations(
  performance: any, 
  sources: any[], 
  qualityReports: any[]
): string[] {
  const recommendations = [];
  
  // Performance-based recommendations
  if (performance.processing_success_rate < 50) {
    recommendations.push("Processing success rate is low - review content generation pipeline and error handling");
  }
  
  if (performance.average_quality_score < 70) {
    recommendations.push("Average quality scores are below target - consider refining AI prompts and quality criteria");
  }
  
  if (performance.regional_relevance_avg < 60) {
    recommendations.push("Regional relevance is low - enhance geographic context detection and local angle identification");
  }
  
  // Source-based recommendations
  const failingSources = sources.filter(s => s.success_rate < 50);
  if (failingSources.length > 0) {
    recommendations.push(`${failingSources.length} sources have low success rates - review scraping configurations`);
  }
  
  const inactiveSources = sources.filter(s => s.last_scraped === 'Never' || 
    new Date(s.last_scraped).getTime() < Date.now() - (24 * 60 * 60 * 1000));
  if (inactiveSources.length > 0) {
    recommendations.push(`${inactiveSources.length} sources haven't been scraped recently - check scheduling and connectivity`);
  }
  
  // Quality-based recommendations
  const lowQualityReports = qualityReports.filter(r => r.overall_score < 50);
  if (lowQualityReports.length > qualityReports.length * 0.2) {
    recommendations.push("High percentage of low-quality content - review content standards and filtering criteria");
  }
  
  const brandSafetyIssues = qualityReports.filter(r => !r.analysis_data?.brand_safety?.safe);
  if (brandSafetyIssues.length > 0) {
    recommendations.push(`${brandSafetyIssues.length} brand safety issues detected - implement stricter content filtering`);
  }
  
  // General recommendations
  if (recommendations.length === 0) {
    recommendations.push("System performance is good - consider expanding to additional sources or regions");
  }
  
  return recommendations;
}