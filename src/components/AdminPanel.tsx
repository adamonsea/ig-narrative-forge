import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DollarSign, Zap, Image, FileText } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ApiUsage {
  id: string;
  service_name: string;
  operation: string;
  cost_usd: number;
  tokens_used: number;
  created_at: string;
}

interface CostSummary {
  storyGeneration: {
    total: number;
    count: number;
    avgCost: number;
  };
  imageGeneration: {
    total: number;
    count: number;
    avgCost: number;
  };
  totalCost: number;
  totalOperations: number;
}

export const AdminPanel = () => {
  const [apiUsage, setApiUsage] = useState<ApiUsage[]>([]);
  const [costSummary, setCostSummary] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchApiUsage = async () => {
    try {
      const { data, error } = await supabase
        .from('api_usage')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      
      if (error) throw error;
      setApiUsage(data || []);
      calculateCostSummary(data || []);
    } catch (error) {
      console.error('Failed to fetch API usage:', error);
      toast({
        title: "Error",
        description: "Failed to fetch API usage data",
        variant: "destructive",
      });
    }
  };

  const calculateCostSummary = (usage: ApiUsage[]) => {
    const storyGenOps = usage.filter(u => 
      u.service_name.toLowerCase().includes('openai') || 
      u.operation.toLowerCase().includes('content') ||
      u.operation.toLowerCase().includes('text') ||
      u.operation.toLowerCase().includes('story')
    );
    
    const imageGenOps = usage.filter(u => 
      u.service_name.toLowerCase().includes('ideogram') ||
      u.service_name.toLowerCase().includes('fal') ||
      u.service_name.toLowerCase().includes('replicate') ||
      u.operation.toLowerCase().includes('image') ||
      u.operation.toLowerCase().includes('visual')
    );

    const storyGenTotal = storyGenOps.reduce((sum, op) => sum + Number(op.cost_usd || 0), 0);
    const imageGenTotal = imageGenOps.reduce((sum, op) => sum + Number(op.cost_usd || 0), 0);
    
    setCostSummary({
      storyGeneration: {
        total: storyGenTotal,
        count: storyGenOps.length,
        avgCost: storyGenOps.length > 0 ? storyGenTotal / storyGenOps.length : 0
      },
      imageGeneration: {
        total: imageGenTotal,
        count: imageGenOps.length,
        avgCost: imageGenOps.length > 0 ? imageGenTotal / imageGenOps.length : 0
      },
      totalCost: storyGenTotal + imageGenTotal,
      totalOperations: usage.length
    });
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchApiUsage();
      setLoading(false);
    };

    loadData();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold">Admin Panel</h2>
        <Button onClick={fetchApiUsage} variant="outline">
          Refresh Data
        </Button>
      </div>

      {/* API Cost Overview */}
      {costSummary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Story Generation Cost</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(costSummary.storyGeneration.total)}</div>
              <p className="text-xs text-muted-foreground">
                {costSummary.storyGeneration.count} operations • Avg: {formatCurrency(costSummary.storyGeneration.avgCost)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Image Generation Cost</CardTitle>
              <Image className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(costSummary.imageGeneration.total)}</div>
              <p className="text-xs text-muted-foreground">
                {costSummary.imageGeneration.count} operations • Avg: {formatCurrency(costSummary.imageGeneration.avgCost)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total API Cost</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(costSummary.totalCost)}</div>
              <p className="text-xs text-muted-foreground">
                {costSummary.totalOperations} total operations
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Cost Efficiency</CardTitle>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {costSummary.totalOperations > 0 ? formatCurrency(costSummary.totalCost / costSummary.totalOperations) : '$0.0000'}
              </div>
              <p className="text-xs text-muted-foreground">
                Average cost per operation
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* API Usage Details */}
      <Card>
        <CardHeader>
          <CardTitle>Recent API Usage</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-4">Service</th>
                  <th className="text-left p-4">Operation</th>
                  <th className="text-left p-4">Cost (USD)</th>
                  <th className="text-left p-4">Tokens</th>
                  <th className="text-left p-4">Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {apiUsage.slice(0, 50).map((usage) => (
                  <tr key={usage.id} className="border-b hover:bg-muted/50">
                    <td className="p-4">
                      <Badge 
                        variant={usage.service_name.toLowerCase().includes('openai') ? 'default' : 'secondary'}
                      >
                        {usage.service_name}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm">{usage.operation}</td>
                    <td className="p-4 font-mono">{formatCurrency(Number(usage.cost_usd || 0))}</td>
                    <td className="p-4">{usage.tokens_used?.toLocaleString() || 0}</td>
                    <td className="p-4 text-sm text-muted-foreground">
                      {new Date(usage.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};