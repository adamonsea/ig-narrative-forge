import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { CheckCircle, XCircle, Clock, Play, Loader2, AlertTriangle, FileText, ExternalLink } from 'lucide-react';

interface ValidationResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed' | 'warning';
  message?: string;
  duration?: number;
  details?: any;
  progress?: number;
}

interface SourceValidation {
  sourceId: string;
  sourceName: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  articlesFound: number;
  validArticles: number;
  avgWordCount: number;
  titlesExtracted: number;
  errors: string[];
}

export const Phase4Validator = () => {
  const [validations, setValidations] = useState<ValidationResult[]>([
    { name: 'Content Extraction Quality', status: 'pending' },
    { name: 'Word Count Standards (50+ words)', status: 'pending' },
    { name: 'Title Extraction Success', status: 'pending' },
    { name: 'Processing Status Compliance', status: 'pending' },
    { name: 'Source Scraping Coverage', status: 'pending' },
    { name: 'Full Content vs RSS Summary', status: 'pending' }
  ]);
  
  const [sourceValidations, setSourceValidations] = useState<SourceValidation[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState('');
  const { toast } = useToast();

  const updateValidationStatus = (index: number, status: ValidationResult['status'], message?: string, details?: any, duration?: number, progress?: number) => {
    setValidations(prev => prev.map((validation, i) => 
      i === index ? { ...validation, status, message, details, duration, progress } : validation
    ));
  };

  const validateContentExtractionQuality = async () => {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, body, word_count, source_url, processing_status')
      .not('body', 'is', null)
      .gte('word_count', 1)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Failed to fetch articles: ${error.message}`);
    if (!articles || articles.length === 0) throw new Error('No articles found for validation');

    const fullContentArticles = articles.filter(a => a.body && a.body.length > 200);
    const qualityScore = (fullContentArticles.length / articles.length) * 100;

    if (qualityScore < 70) {
      throw new Error(`Only ${qualityScore.toFixed(1)}% of articles have substantial content (>200 chars)`);
    }

    return {
      totalArticles: articles.length,
      fullContentArticles: fullContentArticles.length,
      qualityScore: qualityScore.toFixed(1),
      avgContentLength: Math.round(fullContentArticles.reduce((sum, a) => sum + a.body.length, 0) / fullContentArticles.length)
    };
  };

  const validateWordCountStandards = async () => {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, word_count, processing_status')
      .not('word_count', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(`Failed to fetch articles: ${error.message}`);
    if (!articles || articles.length === 0) throw new Error('No articles with word counts found');

    const validWordCountArticles = articles.filter(a => a.word_count >= 50);
    const lowWordCountArticles = articles.filter(a => a.word_count < 50);
    const complianceRate = (validWordCountArticles.length / articles.length) * 100;

    // Check processing status alignment
    const correctlyProcessed = articles.filter(a => 
      (a.word_count >= 50 && a.processing_status === 'processed') ||
      (a.word_count < 50 && a.processing_status === 'discarded')
    );

    const statusAlignment = (correctlyProcessed.length / articles.length) * 100;

    return {
      totalArticles: articles.length,
      validWordCount: validWordCountArticles.length,
      lowWordCount: lowWordCountArticles.length,
      complianceRate: complianceRate.toFixed(1),
      statusAlignment: statusAlignment.toFixed(1),
      avgWordCount: Math.round(articles.reduce((sum, a) => sum + (a.word_count || 0), 0) / articles.length)
    };
  };

  const validateTitleExtraction = async () => {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, source_url')
      .not('title', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) throw new Error(`Failed to fetch articles: ${error.message}`);
    if (!articles || articles.length === 0) throw new Error('No articles found');

    const validTitles = articles.filter(a => a.title && a.title.trim().length > 10);
    const extractionRate = (validTitles.length / articles.length) * 100;

    if (extractionRate < 80) {
      throw new Error(`Only ${extractionRate.toFixed(1)}% of articles have proper titles (>10 chars)`);
    }

    return {
      totalArticles: articles.length,
      validTitles: validTitles.length,
      extractionRate: extractionRate.toFixed(1),
      avgTitleLength: Math.round(validTitles.reduce((sum, a) => sum + a.title.length, 0) / validTitles.length)
    };
  };

  const validateProcessingStatusCompliance = async () => {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, processing_status, word_count')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) throw new Error(`Failed to fetch articles: ${error.message}`);
    if (!articles || articles.length === 0) throw new Error('No articles found');

    const validStatuses = ['new', 'processing', 'processed', 'discarded', 'archived'];
    const invalidStatuses = articles.filter(a => !validStatuses.includes(a.processing_status));
    
    if (invalidStatuses.length > 0) {
      throw new Error(`Found ${invalidStatuses.length} articles with invalid processing status`);
    }

    const statusCounts = articles.reduce((acc, a) => {
      acc[a.processing_status] = (acc[a.processing_status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalArticles: articles.length,
      statusDistribution: statusCounts,
      validStatusCount: articles.length - invalidStatuses.length,
      complianceRate: '100.0'
    };
  };

  const validateSourceScrapingCoverage = async () => {
    const { data: sources, error: sourcesError } = await supabase
      .from('content_sources')
      .select('*')
      .eq('is_active', true);

    if (sourcesError) throw new Error(`Failed to fetch sources: ${sourcesError.message}`);
    if (!sources || sources.length === 0) throw new Error('No active sources found');

    // Test each active source
    const sourceResults: SourceValidation[] = [];
    
    for (const source of sources) {
      setCurrentTest(`Testing ${source.source_name}...`);
      
      const sourceValidation: SourceValidation = {
        sourceId: source.id,
        sourceName: source.source_name,
        status: 'running',
        articlesFound: 0,
        validArticles: 0,
        avgWordCount: 0,
        titlesExtracted: 0,
        errors: []
      };

      try {
        // Check articles from this source
        const { data: articles, error: articlesError } = await supabase
          .from('articles')
          .select('id, title, body, word_count, processing_status')
          .eq('source_id', source.id)
          .order('created_at', { ascending: false })
          .limit(20);

        if (articlesError) {
          sourceValidation.errors.push(`Database error: ${articlesError.message}`);
        } else if (articles) {
          sourceValidation.articlesFound = articles.length;
          sourceValidation.validArticles = articles.filter(a => a.word_count >= 50).length;
          sourceValidation.titlesExtracted = articles.filter(a => a.title && a.title.length > 10).length;
          sourceValidation.avgWordCount = articles.length > 0 
            ? Math.round(articles.reduce((sum, a) => sum + (a.word_count || 0), 0) / articles.length)
            : 0;
        }

        // Test scraping if we have a feed URL
        if (source.feed_url && sourceValidation.articlesFound < 5) {
          try {
            const { data: scrapeData, error: scrapeError } = await supabase.functions.invoke('hybrid-scraper', {
              body: {
                feedUrl: source.feed_url,
                sourceId: source.id,
                region: source.region || 'Eastbourne',
                testMode: true
              }
            });

            if (scrapeError) {
              sourceValidation.errors.push(`Scraping error: ${scrapeError.message}`);
            } else if (scrapeData?.success) {
              sourceValidation.status = 'passed';
            } else {
              sourceValidation.errors.push(`Scraping failed: ${scrapeData?.error || 'Unknown error'}`);
            }
          } catch (scrapeErr: any) {
            sourceValidation.errors.push(`Scraping exception: ${scrapeErr.message}`);
          }
        }

        if (sourceValidation.errors.length === 0 && sourceValidation.articlesFound > 0) {
          sourceValidation.status = 'passed';
        } else if (sourceValidation.errors.length > 0) {
          sourceValidation.status = 'failed';
        }

      } catch (err: any) {
        sourceValidation.errors.push(`Validation error: ${err.message}`);
        sourceValidation.status = 'failed';
      }

      sourceResults.push(sourceValidation);
    }

    setSourceValidations(sourceResults);
    
    const passedSources = sourceResults.filter(s => s.status === 'passed').length;
    const failedSources = sourceResults.filter(s => s.status === 'failed').length;

    return {
      totalSources: sources.length,
      passedSources,
      failedSources,
      coverageRate: ((passedSources / sources.length) * 100).toFixed(1),
      sourceResults
    };
  };

  const validateContentVsRSSSummary = async () => {
    const { data: articles, error } = await supabase
      .from('articles')
      .select('id, title, body, word_count')
      .not('body', 'is', null)
      .gte('word_count', 50)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) throw new Error(`Failed to fetch articles: ${error.message}`);
    if (!articles || articles.length === 0) throw new Error('No articles found');

    // Articles with substantial content (likely full extraction, not just RSS summary)
    const fullContentArticles = articles.filter(a => 
      a.body.length > 500 && // More than typical RSS summary
      a.word_count > 100 &&   // Substantial word count
      !a.body.includes('[...]') && // No truncation indicators
      !a.body.includes('Read more') // No summary indicators
    );

    const fullContentRate = (fullContentArticles.length / articles.length) * 100;

    if (fullContentRate < 60) {
      return {
        status: 'warning',
        message: `Only ${fullContentRate.toFixed(1)}% appear to be full content (not RSS summaries)`,
        totalArticles: articles.length,
        fullContentArticles: fullContentArticles.length,
        fullContentRate: fullContentRate.toFixed(1),
        avgFullContentLength: Math.round(fullContentArticles.reduce((sum, a) => sum + a.body.length, 0) / fullContentArticles.length)
      };
    }

    return {
      totalArticles: articles.length,
      fullContentArticles: fullContentArticles.length,
      fullContentRate: fullContentRate.toFixed(1),
      avgFullContentLength: Math.round(fullContentArticles.reduce((sum, a) => sum + a.body.length, 0) / fullContentArticles.length)
    };
  };

  const runValidation = async (validationName: string, validationFunction: () => Promise<any>) => {
    const index = validations.findIndex(v => v.name === validationName);
    const startTime = Date.now();
    
    updateValidationStatus(index, 'running');
    setCurrentTest(validationName);
    
    try {
      const result = await validationFunction();
      const duration = Date.now() - startTime;
      
      if (result.status === 'warning') {
        updateValidationStatus(index, 'warning', result.message, result, duration);
      } else {
        updateValidationStatus(index, 'passed', 'Validation completed successfully', result, duration);
      }
      return true;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      updateValidationStatus(index, 'failed', error.message || 'Validation failed', error, duration);
      return false;
    }
  };

  const runAllValidations = async () => {
    setIsRunning(true);
    setSourceValidations([]);
    
    // Reset all validations to pending
    setValidations(prev => prev.map(validation => ({ ...validation, status: 'pending' as const })));
    
    try {
      await runValidation('Content Extraction Quality', validateContentExtractionQuality);
      await runValidation('Word Count Standards (50+ words)', validateWordCountStandards);
      await runValidation('Title Extraction Success', validateTitleExtraction);
      await runValidation('Processing Status Compliance', validateProcessingStatusCompliance);
      await runValidation('Source Scraping Coverage', validateSourceScrapingCoverage);
      await runValidation('Full Content vs RSS Summary', validateContentVsRSSSummary);
      
      const passedValidations = validations.filter(v => v.status === 'passed').length;
      const warningValidations = validations.filter(v => v.status === 'warning').length;
      const totalValidations = validations.length;
      
      toast({
        title: "Phase 4 Validation Complete",
        description: `${passedValidations}/${totalValidations} validations passed${warningValidations > 0 ? `, ${warningValidations} warnings` : ''}`,
        variant: passedValidations + warningValidations === totalValidations ? "default" : "destructive",
      });
    } catch (error) {
      toast({
        title: "Validation Failed",
        description: "An error occurred during validation",
        variant: "destructive",
      });
    } finally {
      setIsRunning(false);
      setCurrentTest('');
    }
  };

  const getStatusIcon = (status: ValidationResult['status']) => {
    switch (status) {
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'running':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusBadge = (status: ValidationResult['status']) => {
    switch (status) {
      case 'passed':
        return <Badge variant="outline" className="text-green-700 border-green-300">Passed</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      case 'warning':
        return <Badge variant="outline" className="text-yellow-700 border-yellow-300">Warning</Badge>;
      case 'running':
        return <Badge variant="outline" className="text-blue-700 border-blue-300">Running</Badge>;
      default:
        return <Badge variant="outline" className="text-gray-500">Pending</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Phase 4: Test & Validation
            <Button 
              onClick={runAllValidations} 
              disabled={isRunning}
              className="flex items-center gap-2"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running Validations...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run All Validations
                </>
              )}
            </Button>
          </CardTitle>
          <CardDescription>
            Comprehensive validation of Phase 1-3 improvements: full content extraction, 50+ word standards, and processing compliance
          </CardDescription>
          {currentTest && (
            <div className="text-sm text-blue-600 font-medium">
              Currently testing: {currentTest}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {validations.map((validation, index) => (
            <div key={validation.name} className="space-y-2">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <div className="flex items-center gap-3">
                  {getStatusIcon(validation.status)}
                  <span className="font-medium">{validation.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {validation.duration && (
                    <span className="text-sm text-muted-foreground">
                      {validation.duration}ms
                    </span>
                  )}
                  {getStatusBadge(validation.status)}
                </div>
              </div>
              
              {validation.message && (
                <div className={`p-2 rounded text-sm ${
                  validation.status === 'failed' 
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : validation.status === 'warning'
                    ? 'bg-yellow-50 text-yellow-700 border border-yellow-200'
                    : 'bg-green-50 text-green-700 border border-green-200'
                }`}>
                  {validation.message}
                </div>
              )}
              
              {validation.details && (validation.status === 'passed' || validation.status === 'warning') && (
                <details className="text-sm">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                    View validation details
                  </summary>
                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                    {JSON.stringify(validation.details, null, 2)}
                  </pre>
                </details>
              )}
              
              {index < validations.length - 1 && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Source Validation Results */}
      {sourceValidations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Individual Source Validation Results</CardTitle>
            <CardDescription>
              Detailed validation results for each active content source
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4">
              {sourceValidations.map((source) => (
                <div key={source.sourceId} className="p-4 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-medium">{source.sourceName}</h4>
                    <Badge variant={source.status === 'passed' ? 'outline' : 'destructive'}>
                      {source.status === 'passed' ? 'Passed' : 'Failed'}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-2">
                    <div>
                      <span className="text-muted-foreground">Articles Found: </span>
                      <span className="font-medium">{source.articlesFound}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Valid (50+ words): </span>
                      <span className="font-medium">{source.validArticles}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Avg Word Count: </span>
                      <span className="font-medium">{source.avgWordCount}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Titles Extracted: </span>
                      <span className="font-medium">{source.titlesExtracted}</span>
                    </div>
                  </div>
                  
                  {source.errors.length > 0 && (
                    <div className="text-sm text-red-600 bg-red-50 p-2 rounded border border-red-200">
                      <strong>Errors:</strong>
                      <ul className="mt-1 space-y-1">
                        {source.errors.map((error, i) => (
                          <li key={i}>• {error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Statistics */}
      <Card>
        <CardHeader>
          <CardTitle>Validation Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Total Validations: </span>
              <span className="font-medium">{validations.length}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Passed: </span>
              <span className="font-medium text-green-600">
                {validations.filter(v => v.status === 'passed').length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Warnings: </span>
              <span className="font-medium text-yellow-600">
                {validations.filter(v => v.status === 'warning').length}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground">Failed: </span>
              <span className="font-medium text-red-600">
                {validations.filter(v => v.status === 'failed').length}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};