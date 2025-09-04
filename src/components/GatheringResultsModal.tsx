import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, AlertCircle, ExternalLink, RefreshCw, Clock } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface GatheringResult {
  success: boolean;
  isPartialSuccess?: boolean;
  isCompleteFailure?: boolean;
  message: string;
  sourcesTriggered: number;
  successful: number;
  failed: number;
  successRate: number;
  totalArticles: number;
  detailedResults?: Array<{
    success: boolean;
    sourceName: string;
    articlesStored: number;
    error?: string;
    errorType?: string;
  }>;
  errorsByType?: Record<string, Array<{
    source: string;
    error: string;
  }>>;
  recommendations?: Array<{
    type: string;
    title: string;
    description: string;
    actions: string[];
  }>;
}

interface GatheringResultsModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: GatheringResult | null;
  onRetrySource?: (sourceName: string) => void;
}

export const GatheringResultsModal: React.FC<GatheringResultsModalProps> = ({
  isOpen,
  onClose,
  result,
  onRetrySource
}) => {
  if (!result) return null;

  const getStatusIcon = (success: boolean) => {
    return success ? (
      <CheckCircle className="w-4 h-4 text-green-600" />
    ) : (
      <XCircle className="w-4 h-4 text-red-600" />
    );
  };

  const getErrorTypeIcon = (errorType: string) => {
    switch (errorType) {
      case 'access_denied':
        return <AlertCircle className="w-4 h-4 text-orange-500" />;
      case 'not_found':
        return <ExternalLink className="w-4 h-4 text-red-500" />;
      case 'timeout':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      default:
        return <XCircle className="w-4 h-4 text-red-500" />;
    }
  };

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 80) return "text-green-600";
    if (rate >= 50) return "text-yellow-600";
    return "text-red-600";
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {result.isCompleteFailure ? (
              <XCircle className="w-5 h-5 text-red-600" />
            ) : result.isPartialSuccess ? (
              <AlertCircle className="w-5 h-5 text-yellow-600" />
            ) : (
              <CheckCircle className="w-5 h-5 text-green-600" />
            )}
            Content Gathering Results
          </DialogTitle>
          <DialogDescription>{result.message}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold">{result.sourcesTriggered}</div>
                <div className="text-sm text-muted-foreground">Total Sources</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-green-600">{result.successful}</div>
                <div className="text-sm text-muted-foreground">Successful</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className="text-2xl font-bold text-red-600">{result.failed}</div>
                <div className="text-sm text-muted-foreground">Failed</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4">
                <div className={`text-2xl font-bold ${getSuccessRateColor(result.successRate)}`}>
                  {result.successRate}%
                </div>
                <div className="text-sm text-muted-foreground">Success Rate</div>
              </CardContent>
            </Card>
          </div>

          {/* Articles Found */}
          {result.totalArticles > 0 && (
            <Card>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-lg font-semibold">
                    {result.totalArticles} new articles found
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Source Results */}
          {result.detailedResults && result.detailedResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Source Details</CardTitle>
                <CardDescription>
                  Individual results for each content source
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {result.detailedResults.map((source, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(source.success)}
                        <div>
                          <div className="font-medium">{source.sourceName}</div>
                          {source.success ? (
                            <div className="text-sm text-muted-foreground">
                              {source.articlesStored} articles found
                            </div>
                          ) : (
                            <div className="text-sm text-red-600">{source.error}</div>
                          )}
                        </div>
                      </div>
                      {!source.success && onRetrySource && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => onRetrySource(source.sourceName)}
                        >
                          <RefreshCw className="w-3 h-3 mr-1" />
                          Retry
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error Analysis */}
          {result.errorsByType && Object.keys(result.errorsByType).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Error Analysis</CardTitle>
                <CardDescription>
                  Common issues found during gathering
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {Object.entries(result.errorsByType).map(([errorType, errors]) => (
                    <div key={errorType} className="border rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-2">
                        {getErrorTypeIcon(errorType)}
                        <span className="font-medium capitalize">
                          {errorType.replace('_', ' ')} ({errors.length} sources)
                        </span>
                      </div>
                      <div className="space-y-1">
                        {errors.slice(0, 3).map((error, index) => (
                          <div key={index} className="text-sm text-muted-foreground">
                            • {error.source}: {error.error}
                          </div>
                        ))}
                        {errors.length > 3 && (
                          <div className="text-sm text-muted-foreground">
                            ... and {errors.length - 3} more sources
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Recommendations */}
          {result.recommendations && result.recommendations.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Recommendations</CardTitle>
                <CardDescription>
                  Suggested actions to improve gathering success
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {result.recommendations.map((rec, index) => (
                    <div key={index} className="border rounded-lg p-4">
                      <div className="font-medium mb-2">{rec.title}</div>
                      <div className="text-sm text-muted-foreground mb-3">
                        {rec.description}
                      </div>
                      <div className="space-y-1">
                        {rec.actions.map((action, actionIndex) => (
                          <div key={actionIndex} className="text-sm flex items-center gap-2">
                            <div className="w-1 h-1 bg-primary rounded-full"></div>
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex justify-end pt-4">
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};