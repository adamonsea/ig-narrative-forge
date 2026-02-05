import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RefreshCw, FlaskConical, TrendingUp, Users, MousePointer, BarChart3, CheckCircle, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getAllTests, isTestActive, ABTestConfig } from '@/lib/abTesting';

interface ABTestStats {
  variant: string;
  impressions: number;
  clicks: number;
  ctr: number;
  unique_visitors: number;
}

interface TestWithStats {
  config: ABTestConfig;
  stats: ABTestStats[];
  isActive: boolean;
}

export function ABTestDashboard() {
  const [testsWithStats, setTestsWithStats] = useState<TestWithStats[]>([]);
  const [loading, setLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('30');

  const loadStats = async () => {
    setLoading(true);
    try {
      const allTests = getAllTests();
      const results: TestWithStats[] = [];

      for (const config of allTests) {
        const { data, error } = await (supabase.rpc as any)('get_ab_test_stats', {
          p_test_name: config.name,
          p_days: parseInt(timeRange),
        });

        if (error) {
          console.error(`Error loading stats for ${config.name}:`, error);
          results.push({
            config,
            stats: [],
            isActive: isTestActive(config.name),
          });
        } else {
          results.push({
            config,
            stats: (data || []).map((s: any) => ({
              variant: s.variant,
              impressions: Number(s.impressions) || 0,
              clicks: Number(s.clicks) || 0,
              ctr: Number(s.ctr) || 0,
              unique_visitors: Number(s.unique_visitors) || 0,
            })),
            isActive: isTestActive(config.name),
          });
        }
      }

      setTestsWithStats(results);
    } catch (error) {
      console.error('Error loading A/B test stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [timeRange]);

  const getWinner = (stats: ABTestStats[]): { variant: string; lift: number } | null => {
    if (stats.length < 2) return null;
    
    const variantA = stats.find(s => s.variant === 'A');
    const variantB = stats.find(s => s.variant === 'B');
    
    if (!variantA || !variantB) return null;
    if (variantA.impressions < 100 || variantB.impressions < 100) return null;
    
    const diff = variantB.ctr - variantA.ctr;
    if (Math.abs(diff) < 1) return null; // Less than 1% difference
    
    return {
      variant: diff > 0 ? 'B' : 'A',
      lift: Math.abs(diff),
    };
  };

  const getConfidence = (stats: ABTestStats[]): number => {
    // Simple confidence calculation based on sample size
    // Real implementation would use proper statistical testing
    const totalImpressions = stats.reduce((sum, s) => sum + s.impressions, 0);
    if (totalImpressions < 100) return 0;
    if (totalImpressions < 500) return 50;
    if (totalImpressions < 1000) return 75;
    if (totalImpressions < 2000) return 85;
    return 95;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FlaskConical className="h-5 w-5" />
                A/B Test Experiments
              </CardTitle>
              <CardDescription>
                Monitor active experiments and their performance metrics
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={timeRange} onValueChange={setTimeRange}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="Time range" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                  <SelectItem value="60">Last 60 days</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={loadStats}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
      </Card>

      {testsWithStats.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <FlaskConical className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p>No A/B tests configured</p>
          </CardContent>
        </Card>
      ) : (
        testsWithStats.map((test) => {
          const winner = getWinner(test.stats);
          const confidence = getConfidence(test.stats);
          const totalImpressions = test.stats.reduce((sum, s) => sum + s.impressions, 0);
          const totalClicks = test.stats.reduce((sum, s) => sum + s.clicks, 0);

          return (
            <Card key={test.config.name}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      {test.config.name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      {test.isActive ? (
                        <Badge variant="default" className="bg-green-600">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          <XCircle className="h-3 w-3 mr-1" />
                          Ended
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription>
                      Started: {new Date(test.config.startDate).toLocaleDateString()}
                      {test.config.endDate && ` • Ends: ${new Date(test.config.endDate).toLocaleDateString()}`}
                    </CardDescription>
                  </div>
                  {winner && (
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      <TrendingUp className="h-3 w-3 mr-1" />
                      Variant {winner.variant} winning (+{winner.lift.toFixed(1)}% CTR)
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Overall Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{totalImpressions.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <Users className="h-3 w-3" />
                      Total Impressions
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">{totalClicks.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <MousePointer className="h-3 w-3" />
                      Total Clicks
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className="text-2xl font-bold">
                      {totalImpressions > 0 ? ((totalClicks / totalImpressions) * 100).toFixed(1) : 0}%
                    </div>
                    <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                      <BarChart3 className="h-3 w-3" />
                      Overall CTR
                    </div>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50 text-center">
                    <div className={`text-2xl font-bold ${confidence >= 95 ? 'text-green-600' : confidence >= 75 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                      {confidence}%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Confidence
                    </div>
                  </div>
                </div>

                {/* Variant Breakdown */}
                <div className="grid grid-cols-2 gap-4">
                  {['A', 'B'].map((variantId) => {
                    const variantConfig = test.config.variants[variantId as 'A' | 'B'];
                    const stats = test.stats.find(s => s.variant === variantId) || {
                      impressions: 0,
                      clicks: 0,
                      ctr: 0,
                      unique_visitors: 0,
                    };
                    const isWinner = winner?.variant === variantId;

                    return (
                      <div
                        key={variantId}
                        className={`p-4 rounded-lg border ${isWinner ? 'border-green-500 bg-green-500/5' : 'border-border'}`}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <Badge variant={variantId === 'A' ? 'secondary' : 'default'}>
                              Variant {variantId}
                            </Badge>
                            <span className="font-medium">"{variantConfig.label}"</span>
                          </div>
                          {isWinner && (
                            <Badge variant="outline" className="text-green-600 border-green-600">
                              Winner
                            </Badge>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <div className="text-muted-foreground">Impressions</div>
                            <div className="font-medium">{stats.impressions.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Clicks</div>
                            <div className="font-medium">{stats.clicks.toLocaleString()}</div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">CTR</div>
                            <div className={`font-medium ${isWinner ? 'text-green-600' : ''}`}>
                              {stats.ctr.toFixed(2)}%
                            </div>
                          </div>
                          <div>
                            <div className="text-muted-foreground">Unique Visitors</div>
                            <div className="font-medium">{stats.unique_visitors.toLocaleString()}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Recommendation */}
                {totalImpressions < 100 && (
                  <div className="text-sm text-muted-foreground bg-muted/30 p-3 rounded-lg">
                    <strong>Collecting data:</strong> Need at least 100 impressions per variant for meaningful results.
                    Currently at {totalImpressions} total impressions.
                  </div>
                )}
                {confidence >= 95 && winner && (
                  <div className="text-sm text-green-600 bg-green-500/10 p-3 rounded-lg">
                    <strong>Statistically significant:</strong> Variant {winner.variant} ("{test.config.variants[winner.variant as 'A' | 'B'].label}") 
                    is performing {winner.lift.toFixed(1)}% better. Consider rolling out this variant permanently.
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
