import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  Shield, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle,
  Eye,
  Sparkles,
  Target,
  MapPin,
  FileText,
  Clock
} from 'lucide-react';

interface QualityReport {
  overall_score: number;
  brand_safety: {
    score: number;
    issues: string[];
    safe: boolean;
  };
  content_quality: {
    score: number;
    readability: number;
    engagement_potential: number;
    factual_accuracy: number;
  };
  regional_relevance: {
    score: number;
    local_connections: string[];
    geographic_context: string;
  };
  recommendations: string[];
  compliance: {
    editorial_standards: boolean;
    copyright_safe: boolean;
    attribution_complete: boolean;
  };
}

interface QualityAnalyzerProps {
  storyId: string;
  onAnalysisComplete?: (report: QualityReport) => void;
}

export const QualityAnalyzer = ({ storyId, onAnalysisComplete }: QualityAnalyzerProps) => {
  const [analyzing, setAnalyzing] = useState(false);
  const [report, setReport] = useState<QualityReport | null>(null);
  const { toast } = useToast();

  const runQualityAnalysis = async () => {
    try {
      setAnalyzing(true);
      const { data, error } = await supabase.functions.invoke('content-quality-analyzer', {
        body: { storyId, analysisType: 'full' }
      });

      if (error) throw error;

      if (data.success) {
        setReport(data.qualityReport);
        onAnalysisComplete?.(data.qualityReport);
        
        toast({
          title: "Quality analysis complete",
          description: `Overall score: ${data.qualityReport.overall_score}/100`,
        });
      } else {
        throw new Error(data.error);
      }
    } catch (error) {
      console.error('Error running quality analysis:', error);
      toast({
        title: "Analysis failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  const getScoreColor = (score: number): string => {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBg = (score: number): string => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getComplianceIcon = (compliant: boolean) => {
    return compliant ? (
      <CheckCircle2 className="w-4 h-4 text-green-600" />
    ) : (
      <XCircle className="w-4 h-4 text-red-600" />
    );
  };

  return (
    <div className="space-y-6">
      {/* Analysis Trigger */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5" />
            Content Quality Analysis
          </CardTitle>
          <CardDescription>
            AI-powered analysis for brand safety, content quality, and compliance
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={runQualityAnalysis}
            disabled={analyzing}
            className="w-full"
          >
            {analyzing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Analyzing Content...
              </>
            ) : (
              <>
                <Eye className="w-4 h-4 mr-2" />
                Run Quality Analysis
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Quality Report */}
      {report && (
        <>
          {/* Overall Score */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Target className="w-5 h-5" />
                  Overall Quality Score
                </div>
                <div className={`text-3xl font-bold ${getScoreColor(report.overall_score)}`}>
                  {report.overall_score}/100
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Progress 
                value={report.overall_score} 
                className="h-3"
              />
              <div className="mt-2 text-sm text-muted-foreground">
                {report.overall_score >= 80 ? 'Excellent quality' :
                 report.overall_score >= 60 ? 'Good quality' : 'Needs improvement'}
              </div>
            </CardContent>
          </Card>

          {/* Detailed Scores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Brand Safety */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className={`w-4 h-4 ${report.brand_safety.safe ? 'text-green-600' : 'text-red-600'}`} />
                  Brand Safety
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Score</span>
                    <span className={`font-semibold ${getScoreColor(report.brand_safety.score)}`}>
                      {report.brand_safety.score}/100
                    </span>
                  </div>
                  
                  <Progress value={report.brand_safety.score} className="h-2" />
                  
                  <div className="flex items-center gap-2">
                    {report.brand_safety.safe ? (
                      <Badge variant="default">Safe</Badge>
                    ) : (
                      <Badge variant="destructive">Needs Review</Badge>
                    )}
                  </div>

                  {report.brand_safety.issues.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">Issues:</div>
                      {report.brand_safety.issues.map((issue, index) => (
                        <div key={index} className="text-xs text-red-600 flex items-start gap-1">
                          <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                          {issue}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Content Quality */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Content Quality
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Overall</span>
                    <span className={`font-semibold ${getScoreColor(report.content_quality.score)}`}>
                      {report.content_quality.score}/100
                    </span>
                  </div>
                  
                  <Progress value={report.content_quality.score} className="h-2" />
                  
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <span>Readability</span>
                      <span className={getScoreColor(report.content_quality.readability)}>
                        {report.content_quality.readability}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Engagement</span>
                      <span className={getScoreColor(report.content_quality.engagement_potential)}>
                        {report.content_quality.engagement_potential}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Accuracy</span>
                      <span className={getScoreColor(report.content_quality.factual_accuracy)}>
                        {report.content_quality.factual_accuracy}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Regional Relevance */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <MapPin className="w-4 h-4" />
                  Regional Relevance
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Score</span>
                    <span className={`font-semibold ${getScoreColor(report.regional_relevance.score)}`}>
                      {report.regional_relevance.score}/100
                    </span>
                  </div>
                  
                  <Progress value={report.regional_relevance.score} className="h-2" />
                  
                  {report.regional_relevance.geographic_context && (
                    <div className="text-xs text-muted-foreground">
                      <div className="font-medium mb-1">Context:</div>
                      <div>{report.regional_relevance.geographic_context}</div>
                    </div>
                  )}

                  {report.regional_relevance.local_connections.length > 0 && (
                    <div className="space-y-1">
                      <div className="text-xs font-medium text-muted-foreground">Local Connections:</div>
                      {report.regional_relevance.local_connections.slice(0, 3).map((connection, index) => (
                        <Badge key={index} variant="outline" className="text-xs mr-1 mb-1">
                          {connection}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Compliance */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Compliance Check
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Editorial Standards</span>
                  {getComplianceIcon(report.compliance.editorial_standards)}
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Copyright Safe</span>
                  {getComplianceIcon(report.compliance.copyright_safe)}
                </div>
                <div className="flex items-center justify-between p-3 border rounded-lg">
                  <span className="text-sm">Attribution Complete</span>
                  {getComplianceIcon(report.compliance.attribution_complete)}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Recommendations */}
          {report.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Recommendations
                </CardTitle>
                <CardDescription>AI-powered suggestions for improvement</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {report.recommendations.map((recommendation, index) => (
                    <li key={index} className="flex items-start gap-2 p-3 bg-muted/50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                      <span className="text-sm">{recommendation}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
};