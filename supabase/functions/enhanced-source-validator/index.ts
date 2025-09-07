import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidationRequest {
  url: string;
  sourceType: 'RSS' | 'News' | 'Blog' | 'Publication' | 'Official';
  topicType: 'regional' | 'keyword';
  region?: string;
  topicId?: string;
}

interface MethodTestResult {
  method: string;
  success: boolean;
  articlesFound: number;
  successRate: number;
  errors: string[];
  recommendedUsage: string;
}

interface EnhancedValidationResult {
  success: boolean;
  isAccessible: boolean;
  recommendedMethod: string;
  methodTests: MethodTestResult[];
  overallScore: number;
  userGuidance: string;
  warnings: string[];
  errors: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, sourceType, topicType, region, topicId }: ValidationRequest = await req.json();
    
    console.log('🧪 Enhanced validation starting for:', { url, sourceType, topicType });

    const result: EnhancedValidationResult = {
      success: false,
      isAccessible: false,
      recommendedMethod: '',
      methodTests: [],
      overallScore: 0,
      userGuidance: '',
      warnings: [],
      errors: []
    };

    // Test basic accessibility with robust error handling
    const accessibilityResult = await testEnhancedAccessibility(url);
    result.isAccessible = accessibilityResult.success;
    
    if (!accessibilityResult.success) {
      result.errors.push(accessibilityResult.error || 'URL not accessible');
      result.userGuidance = generateUserGuidance(accessibilityResult.errorType, url);
      return createResponse(result);
    }

    console.log('✅ URL is accessible, testing scraping methods...');

    // Test multiple scraping methods in parallel
    const methodsToTest = determineMethodsToTest(sourceType, topicType, url);
    const supabase = await getSupabaseClient();
    
    if (!supabase) {
      result.warnings.push('Cannot test scraping methods: Supabase not configured');
      result.userGuidance = 'Basic validation only - scraping tests unavailable';
      result.success = true;
      return createResponse(result);
    }

    // Run method tests in parallel for speed
    const testPromises = methodsToTest.map(method => 
      testScrapingMethod(supabase, method, url, topicType, region, topicId)
    );

    const testResults = await Promise.allSettled(testPromises);
    
    // Process test results
    result.methodTests = testResults.map((testResult, index) => {
      const method = methodsToTest[index];
      
      if (testResult.status === 'fulfilled' && testResult.value) {
        return testResult.value;
      } else {
        return {
          method,
          success: false,
          articlesFound: 0,
          successRate: 0,
          errors: [testResult.status === 'rejected' ? testResult.reason?.message : 'Unknown error'],
          recommendedUsage: 'Not recommended'
        };
      }
    });

    // Determine best method and overall assessment
    const bestMethod = findBestMethod(result.methodTests);
    result.recommendedMethod = bestMethod.method;
    result.overallScore = calculateOverallScore(result.methodTests);
    result.success = result.overallScore >= 30; // Lenient threshold
    result.userGuidance = generateEnhancedUserGuidance(result);

    console.log('🎯 Validation complete:', {
      success: result.success,
      score: result.overallScore,
      recommendedMethod: result.recommendedMethod
    });

    return createResponse(result);

  } catch (error) {
    console.error('❌ Enhanced validation error:', error);
    return createResponse({
      success: false,
      isAccessible: false,
      recommendedMethod: '',
      methodTests: [],
      overallScore: 0,
      userGuidance: 'Validation failed due to technical error',
      warnings: [],
      errors: [error.message]
    });
  }
});

async function testEnhancedAccessibility(url: string): Promise<{
  success: boolean;
  error?: string;
  errorType?: string;
  contentType?: string;
}> {
  
  const attempts = [
    { url, protocol: 'original' },
    { url: url.replace('https://', 'http://'), protocol: 'http_fallback' }
  ];

  for (const attempt of attempts) {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 15000); // 15 second timeout

      const response = await fetch(attempt.url, {
        method: 'HEAD', // Use HEAD for faster response
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; eeZeeNews-Validator/1.0; +https://eezee.news)',
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate',
          'Connection': 'keep-alive',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow'
      });

      if (response.ok) {
        return {
          success: true,
          contentType: response.headers.get('content-type') || 'unknown'
        };
      } else {
        const errorType = classifyHttpError(response.status);
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          errorType
        };
      }

    } catch (error) {
      if (attempt.protocol === 'http_fallback') {
        const errorType = classifyNetworkError(error.message);
        return {
          success: false,
          error: error.message,
          errorType
        };
      }
      // Continue to HTTP fallback
      console.log(`⚠️ HTTPS failed, trying HTTP: ${error.message}`);
    }
  }

  return {
    success: false,
    error: 'All connection attempts failed',
    errorType: 'network_unreachable'
  };
}

function determineMethodsToTest(sourceType: string, topicType: string, url: string): string[] {
  const allMethods = ['rss_discovery', 'enhanced_html', 'universal_scraper'];
  
  // Prioritize based on source type and URL patterns
  if (url.toLowerCase().includes('rss') || url.toLowerCase().includes('feed') || 
      sourceType === 'RSS') {
    return ['rss_discovery', 'enhanced_html', 'universal_scraper'];
  }
  
  if (sourceType === 'Blog' || url.includes('wordpress') || url.includes('medium')) {
    return ['enhanced_html', 'rss_discovery', 'universal_scraper'];
  }
  
  return ['enhanced_html', 'rss_discovery', 'universal_scraper'];
}

async function getSupabaseClient() {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      return null;
    }
    
    return createClient(supabaseUrl, supabaseKey);
  } catch (error) {
    console.error('Failed to create Supabase client:', error);
    return null;
  }
}

async function testScrapingMethod(
  supabase: any,
  method: string,
  url: string,
  topicType: string,
  region?: string,
  topicId?: string
): Promise<MethodTestResult> {
  
  console.log(`🧪 Testing method: ${method}`);
  
  try {
    const methodMap: Record<string, string> = {
      'rss_discovery': 'universal-scraper',
      'enhanced_html': 'beautiful-soup-scraper',
      'universal_scraper': 'universal-scraper'
    };

    const edgeFunction = methodMap[method] || 'universal-scraper';
    const payload = topicType === 'regional' 
      ? { feedUrl: url, region: region || 'default', testMode: true }
      : { feedUrl: url, topicId, testMode: true };

    const startTime = Date.now();
    const { data, error } = await supabase.functions.invoke(edgeFunction, {
      body: payload
    });
    const duration = Date.now() - startTime;

    if (error) {
      return {
        method,
        success: false,
        articlesFound: 0,
        successRate: 0,
        errors: [error.message],
        recommendedUsage: 'Not recommended - method failed'
      };
    }

    const articlesFound = data?.articles_imported || data?.articlesFound || 0;
    const success = articlesFound > 0;
    
    // Calculate success rate based on articles found and performance
    const performanceScore = Math.max(0, 100 - (duration / 1000) * 2); // Penalize slow methods
    const contentScore = Math.min(100, articlesFound * 10); // Up to 100 for 10+ articles
    const successRate = success ? Math.round((performanceScore + contentScore) / 2) : 0;

    return {
      method,
      success,
      articlesFound,
      successRate,
      errors: success ? [] : ['No articles found'],
      recommendedUsage: generateMethodRecommendation(method, successRate, articlesFound)
    };

  } catch (error) {
    return {
      method,
      success: false,
      articlesFound: 0,
      successRate: 0,
      errors: [error.message],
      recommendedUsage: 'Not recommended - test failed'
    };
  }
}

function findBestMethod(methodTests: MethodTestResult[]): MethodTestResult {
  const successfulMethods = methodTests.filter(m => m.success);
  
  if (successfulMethods.length === 0) {
    return methodTests[0] || {
      method: 'universal_scraper',
      success: false,
      articlesFound: 0,
      successRate: 0,
      errors: ['No methods succeeded'],
      recommendedUsage: 'Manual configuration needed'
    };
  }
  
  // Prioritize by success rate, then by articles found
  return successfulMethods.sort((a, b) => {
    if (b.successRate !== a.successRate) return b.successRate - a.successRate;
    return b.articlesFound - a.articlesFound;
  })[0];
}

function calculateOverallScore(methodTests: MethodTestResult[]): number {
  if (methodTests.length === 0) return 0;
  
  const bestMethod = findBestMethod(methodTests);
  const hasSuccessfulMethod = methodTests.some(m => m.success);
  
  let score = bestMethod.successRate;
  
  // Boost for multiple working methods
  const workingMethods = methodTests.filter(m => m.success).length;
  if (workingMethods > 1) {
    score += workingMethods * 10;
  }
  
  // Boost for high article counts
  if (bestMethod.articlesFound >= 10) {
    score += 20;
  } else if (bestMethod.articlesFound >= 5) {
    score += 10;
  }
  
  return Math.min(100, score);
}

function generateEnhancedUserGuidance(result: EnhancedValidationResult): string {
  if (!result.success) {
    return `❌ Source validation failed. ${result.errors.join(', ')}. Consider finding an alternative source or checking the URL.`;
  }
  
  const bestMethod = result.methodTests.find(m => m.method === result.recommendedMethod);
  
  if (!bestMethod || !bestMethod.success) {
    return `⚠️ Source is accessible but scraping tests failed. You can try adding it manually, but expect low success rates.`;
  }
  
  if (result.overallScore >= 80) {
    return `✅ Excellent source! Use "${result.recommendedMethod}" method. Found ${bestMethod.articlesFound} articles with ${bestMethod.successRate}% success rate.`;
  } else if (result.overallScore >= 60) {
    return `✅ Good source. Use "${result.recommendedMethod}" method. Found ${bestMethod.articlesFound} articles. May need occasional monitoring.`;
  } else if (result.overallScore >= 40) {
    return `⚠️ Marginal source. Use "${result.recommendedMethod}" method but expect moderate success rates. Consider finding additional sources.`;
  } else {
    return `⚠️ Low-performing source. While it works, you may want to find better alternatives for consistent content.`;
  }
}

function generateUserGuidance(errorType: string, url: string): string {
  switch (errorType) {
    case 'ssl_error':
      return `🔒 SSL certificate error. The site may have security issues. Try the HTTP version or contact the site administrator.`;
    case 'dns_error':
      return `🌐 Domain not found. The URL may be incorrect or the site may no longer exist.`;
    case 'timeout':
      return `⏱️ Connection timeout. The site is slow or unreliable. Try again later or find an alternative source.`;
    case 'forbidden':
      return `🚫 Access denied. The site may be blocking automated requests. Consider contacting the site for API access.`;
    case 'not_found':
      return `❌ Page not found. Check the URL is correct or try the site's main page.`;
    default:
      return `❌ Connection failed. Please verify the URL and try again.`;
  }
}

function generateMethodRecommendation(method: string, successRate: number, articlesFound: number): string {
  if (successRate >= 80) {
    return `Excellent choice - highly reliable`;
  } else if (successRate >= 60) {
    return `Good option - should work consistently`;
  } else if (successRate >= 40) {
    return `Moderate option - may need occasional attention`;
  } else if (articlesFound > 0) {
    return `Works but unreliable - consider as backup method`;
  } else {
    return `Not recommended - use alternative method`;
  }
}

function classifyHttpError(status: number): string {
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'unknown_http_error';
}

function classifyNetworkError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('certificate') || lower.includes('ssl') || lower.includes('tls')) {
    return 'ssl_error';
  }
  if (lower.includes('timeout')) {
    return 'timeout';
  }
  if (lower.includes('enotfound') || lower.includes('getaddrinfo')) {
    return 'dns_error';
  }
  return 'network_error';
}

function createResponse(result: EnhancedValidationResult): Response {
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  });
}