import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RefreshCw, DollarSign, Cpu, Image, MessageSquare, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';

interface UsageRecord {
  id: string;
  service_name: string;
  operation: string;
  cost_usd: number | null;
  tokens_used: number | null;
  created_at: string;
  region: string | null;
}

interface ProviderSummary {
  provider: string;
  totalCost: number;
  totalRequests: number;
  avgCost: number;
  color: string;
}

interface DailyUsage {
  date: string;
  openai: number;
  deepseek: number;
  lovable: number;
  replicate: number;
  total: number;
}

const PROVIDER_COLORS: Record<string, string> = {
  openai: 'hsl(var(--chart-1))',
  'openai-vision': 'hsl(var(--chart-1))',
  deepseek: 'hsl(var(--chart-2))',
  'lovable-gemini': 'hsl(var(--chart-3))',
  'lovable-ai': 'hsl(var(--chart-3))',
  replicate: 'hsl(var(--chart-4))',
  nebius: 'hsl(var(--chart-5))',
  default: 'hsl(var(--muted-foreground))'
};

const normalizeProviderName = (serviceName: string): string => {
  const lower = serviceName.toLowerCase();
  if (lower.includes('openai') || lower === 'openai') return 'OpenAI';
  if (lower.includes('deepseek')) return 'DeepSeek';
  if (lower.includes('lovable') || lower.includes('gemini')) return 'Lovable AI';
  if (lower.includes('replicate')) return 'Replicate';
  if (lower.includes('nebius')) return 'Nebius';
  return serviceName;
};

const getProviderColor = (serviceName: string): string => {
  const lower = serviceName.toLowerCase();
  if (lower.includes('openai')) return PROVIDER_COLORS.openai;
  if (lower.includes('deepseek')) return PROVIDER_COLORS.deepseek;
  if (lower.includes('lovable') || lower.includes('gemini')) return PROVIDER_COLORS['lovable-gemini'];
  if (lower.includes('replicate')) return PROVIDER_COLORS.replicate;
  if (lower.includes('nebius')) return PROVIDER_COLORS.nebius;
  return PROVIDER_COLORS.default;
};

export const AICostDashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState('30');
  const [usageData, setUsageData] = useState<UsageRecord[]>([]);
  const [providerSummary, setProviderSummary] = useState<ProviderSummary[]>([]);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [operationBreakdown, setOperationBreakdown] = useState<{ name: string; value: number; color: string }[]>([]);

  const loadData = async () => {
    setLoading(true);
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(timeframe));

      const { data, error } = await supabase
        .from('api_usage')
        .select('*')
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      setUsageData(data || []);

      // Calculate provider summary
      const providerMap = new Map<string, { cost: number; count: number }>();
      (data || []).forEach((record) => {
        const provider = normalizeProviderName(record.service_name);
        const existing = providerMap.get(provider) || { cost: 0, count: 0 };
        providerMap.set(provider, {
          cost: existing.cost + (record.cost_usd || 0),
          count: existing.count + 1
        });
      });

      const summaries: ProviderSummary[] = Array.from(providerMap.entries()).map(([provider, stats]) => ({
        provider,
        totalCost: stats.cost,
        totalRequests: stats.count,
        avgCost: stats.count > 0 ? stats.cost / stats.count : 0,
        color: getProviderColor(provider)
      })).sort((a, b) => b.totalCost - a.totalCost);

      setProviderSummary(summaries);

      // Calculate daily usage trends
      const dailyMap = new Map<string, { openai: number; deepseek: number; lovable: number; replicate: number }>();
      (data || []).forEach((record) => {
        const date = record.created_at.split('T')[0];
        const existing = dailyMap.get(date) || { openai: 0, deepseek: 0, lovable: 0, replicate: 0 };
        const provider = normalizeProviderName(record.service_name);
        const cost = record.cost_usd || 0;

        if (provider === 'OpenAI') existing.openai += cost;
        else if (provider === 'DeepSeek') existing.deepseek += cost;
        else if (provider === 'Lovable AI') existing.lovable += cost;
        else if (provider === 'Replicate') existing.replicate += cost;

        dailyMap.set(date, existing);
      });

      const dailyData: DailyUsage[] = Array.from(dailyMap.entries())
        .map(([date, costs]) => ({
          date,
          ...costs,
          total: costs.openai + costs.deepseek + costs.lovable + costs.replicate
        }))
        .sort((a, b) => a.date.localeCompare(b.date));

      setDailyUsage(dailyData);

      // Calculate operation breakdown
      const opMap = new Map<string, number>();
      (data || []).forEach((record) => {
        const op = record.operation;
        opMap.set(op, (opMap.get(op) || 0) + (record.cost_usd || 0));
      });

      const opBreakdown = Array.from(opMap.entries())
        .map(([name, value], index) => ({
          name,
          value,
          color: `hsl(var(--chart-${(index % 5) + 1}))`
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8);

      setOperationBreakdown(opBreakdown);

    } catch (error) {
      console.error('Error loading AI cost data:', error);
      toast.error('Failed to load AI cost data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [timeframe]);

  const totalCost = providerSummary.reduce((sum, p) => sum + p.totalCost, 0);
  const totalRequests = providerSummary.reduce((sum, p) => sum + p.totalRequests, 0);

  // Calculate trend (compare to previous period)
  const midpoint = Math.floor(dailyUsage.length / 2);
  const firstHalf = dailyUsage.slice(0, midpoint).reduce((sum, d) => sum + d.total, 0);
  const secondHalf = dailyUsage.slice(midpoint).reduce((sum, d) => sum + d.total, 0);
  const trend = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : 0;

  const formatCurrency = (value: number) => `$${value.toFixed(2)}`;
  const formatDate = (date: string) => {
    const d = new Date(date);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-foreground">AI Cost Dashboard</h2>
          <p className="text-muted-foreground">Track spending across all AI providers</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Spend</p>
                <p className="text-2xl font-bold text-foreground">{formatCurrency(totalCost)}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
            </div>
            <div className="mt-2 flex items-center text-sm">
              {trend > 5 ? (
                <>
                  <TrendingUp className="h-4 w-4 text-destructive mr-1" />
                  <span className="text-destructive">+{trend.toFixed(0)}% vs previous</span>
                </>
              ) : trend < -5 ? (
                <>
                  <TrendingDown className="h-4 w-4 text-green-600 mr-1" />
                  <span className="text-green-600">{trend.toFixed(0)}% vs previous</span>
                </>
              ) : (
                <>
                  <Minus className="h-4 w-4 text-muted-foreground mr-1" />
                  <span className="text-muted-foreground">Stable</span>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Requests</p>
                <p className="text-2xl font-bold text-foreground">{totalRequests.toLocaleString()}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-secondary/50 flex items-center justify-center">
                <Cpu className="h-5 w-5 text-secondary-foreground" />
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Avg: {totalRequests > 0 ? formatCurrency(totalCost / totalRequests) : '$0.00'}/req
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Image Generation</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(
                    usageData
                      .filter(r => r.operation?.includes('image'))
                      .reduce((sum, r) => sum + (r.cost_usd || 0), 0)
                  )}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-chart-1/10 flex items-center justify-center">
                <Image className="h-5 w-5 text-chart-1" />
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {usageData.filter(r => r.operation?.includes('image')).length} images
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Text/Chat</p>
                <p className="text-2xl font-bold text-foreground">
                  {formatCurrency(
                    usageData
                      .filter(r => !r.operation?.includes('image'))
                      .reduce((sum, r) => sum + (r.cost_usd || 0), 0)
                  )}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-chart-2/10 flex items-center justify-center">
                <MessageSquare className="h-5 w-5 text-chart-2" />
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {usageData.filter(r => !r.operation?.includes('image')).length} requests
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="trends" className="space-y-4">
        <TabsList>
          <TabsTrigger value="trends">Spending Trends</TabsTrigger>
          <TabsTrigger value="providers">By Provider</TabsTrigger>
          <TabsTrigger value="operations">By Operation</TabsTrigger>
        </TabsList>

        <TabsContent value="trends">
          <Card>
            <CardHeader>
              <CardTitle>Daily Spending</CardTitle>
              <CardDescription>Cost breakdown by provider over time</CardDescription>
            </CardHeader>
            <CardContent>
              {dailyUsage.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <LineChart data={dailyUsage}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={formatDate}
                      className="text-muted-foreground text-xs"
                    />
                    <YAxis 
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                      className="text-muted-foreground text-xs"
                    />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      labelFormatter={(label) => new Date(label).toLocaleDateString()}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="openai" 
                      name="OpenAI"
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="deepseek" 
                      name="DeepSeek"
                      stroke="hsl(var(--chart-2))" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="lovable" 
                      name="Lovable AI"
                      stroke="hsl(var(--chart-3))" 
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="replicate" 
                      name="Replicate"
                      stroke="hsl(var(--chart-4))" 
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  No usage data for selected period
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="providers">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Cost Distribution</CardTitle>
                <CardDescription>Spending by AI provider</CardDescription>
              </CardHeader>
              <CardContent>
                {providerSummary.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie
                        data={providerSummary}
                        dataKey="totalCost"
                        nameKey="provider"
                        cx="50%"
                        cy="50%"
                        outerRadius={100}
                        label={({ provider, percent }) => 
                          `${provider} (${(percent * 100).toFixed(0)}%)`
                        }
                      >
                        {providerSummary.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    No data available
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Provider Details</CardTitle>
                <CardDescription>Cost and request breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {providerSummary.map((provider) => (
                    <div 
                      key={provider.provider} 
                      className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                    >
                      <div className="flex items-center gap-3">
                        <div 
                          className="w-3 h-3 rounded-full" 
                          style={{ backgroundColor: provider.color }}
                        />
                        <div>
                          <p className="font-medium text-foreground">{provider.provider}</p>
                          <p className="text-sm text-muted-foreground">
                            {provider.totalRequests} requests
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-foreground">
                          {formatCurrency(provider.totalCost)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          ~{formatCurrency(provider.avgCost)}/req
                        </p>
                      </div>
                    </div>
                  ))}
                  {providerSummary.length === 0 && (
                    <p className="text-center text-muted-foreground py-8">
                      No provider data available
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="operations">
          <Card>
            <CardHeader>
              <CardTitle>Cost by Operation Type</CardTitle>
              <CardDescription>Breakdown of spending by operation</CardDescription>
            </CardHeader>
            <CardContent>
              {operationBreakdown.length > 0 ? (
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={operationBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis 
                      type="number" 
                      tickFormatter={(v) => `$${v.toFixed(2)}`}
                      className="text-muted-foreground text-xs"
                    />
                    <YAxis 
                      type="category" 
                      dataKey="name" 
                      width={150}
                      className="text-muted-foreground text-xs"
                    />
                    <Tooltip 
                      formatter={(value: number) => formatCurrency(value)}
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px'
                      }}
                    />
                    <Bar dataKey="value" name="Cost">
                      {operationBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[350px] flex items-center justify-center text-muted-foreground">
                  No operation data available
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent API Calls</CardTitle>
          <CardDescription>Latest AI usage activity</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 max-h-[300px] overflow-y-auto">
            {usageData.slice(0, 20).map((record) => (
              <div 
                key={record.id}
                className="flex items-center justify-between py-2 px-3 rounded bg-muted/30 text-sm"
              >
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className="font-mono text-xs">
                    {normalizeProviderName(record.service_name)}
                  </Badge>
                  <span className="text-muted-foreground">{record.operation}</span>
                </div>
                <div className="flex items-center gap-4">
                  {record.tokens_used ? (
                    <span className="text-xs text-muted-foreground">
                      {record.tokens_used.toLocaleString()} tokens
                    </span>
                  ) : null}
                  <span className="font-medium text-foreground">
                    {formatCurrency(record.cost_usd || 0)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(record.created_at).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
            {usageData.length === 0 && (
              <p className="text-center text-muted-foreground py-8">
                No recent API calls
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AICostDashboard;
