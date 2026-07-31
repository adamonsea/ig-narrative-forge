import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';

interface MetricRow {
  model: string;
  quality: string | null;
  is_automated: boolean;
  prep_ms: number | null;
  generation_ms: number | null;
  total_ms: number | null;
  output_bytes: number | null;
  credits: number | null;
  cost_usd: number | null;
}

interface Bucket {
  key: string;
  count: number;
  avgPrep: number;
  avgGen: number;
  avgTotal: number;
  credits: number;
  costUsd: number;
}

const avg = (values: number[]) =>
  values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;

export const ImageGenerationMetricsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [buckets, setBuckets] = useState<Bucket[]>([]);
  const [total, setTotal] = useState({ count: 0, credits: 0, costUsd: 0 });

  useEffect(() => {
    const load = async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from('image_generation_metrics' as never)
        .select('model, quality, is_automated, prep_ms, generation_ms, total_ms, output_bytes, credits, cost_usd')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(1000);

      const rows = (data as unknown as MetricRow[]) || [];
      const grouped = new Map<string, MetricRow[]>();
      rows.forEach((row) => {
        const key = `${row.model}${row.is_automated ? ' (auto)' : ' (manual)'}`;
        grouped.set(key, [...(grouped.get(key) || []), row]);
      });

      setBuckets(
        Array.from(grouped.entries())
          .map(([key, items]) => ({
            key,
            count: items.length,
            avgPrep: avg(items.map((i) => i.prep_ms || 0)),
            avgGen: avg(items.map((i) => i.generation_ms || 0)),
            avgTotal: avg(items.map((i) => i.total_ms || 0)),
            credits: items.reduce((sum, i) => sum + (i.credits || 0), 0),
            costUsd: items.reduce((sum, i) => sum + Number(i.cost_usd || 0), 0),
          }))
          .sort((a, b) => b.count - a.count)
      );

      setTotal({
        count: rows.length,
        credits: rows.reduce((sum, r) => sum + (r.credits || 0), 0),
        costUsd: rows.reduce((sum, r) => sum + Number(r.cost_usd || 0), 0),
      });
      setLoading(false);
    };

    load();
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Image generation cost &amp; speed</CardTitle>
        <CardDescription>
          Last 30 days, grouped by model tier. Measurement only — no generation settings changed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner />
          </div>
        ) : buckets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No generations recorded yet. Numbers appear here after the next illustration runs.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Tier</th>
                  <th className="py-2 pr-4 font-medium">Images</th>
                  <th className="py-2 pr-4 font-medium">Avg prep</th>
                  <th className="py-2 pr-4 font-medium">Avg render</th>
                  <th className="py-2 pr-4 font-medium">Avg total</th>
                  <th className="py-2 pr-4 font-medium">Credits</th>
                  <th className="py-2 font-medium">Est. spend</th>
                </tr>
              </thead>
              <tbody>
                {buckets.map((b) => (
                  <tr key={b.key} className="border-b last:border-0">
                    <td className="py-2 pr-4">{b.key}</td>
                    <td className="py-2 pr-4">{b.count}</td>
                    <td className="py-2 pr-4">{(b.avgPrep / 1000).toFixed(1)}s</td>
                    <td className="py-2 pr-4">{(b.avgGen / 1000).toFixed(1)}s</td>
                    <td className="py-2 pr-4">{(b.avgTotal / 1000).toFixed(1)}s</td>
                    <td className="py-2 pr-4">{b.credits}</td>
                    <td className="py-2">${b.costUsd.toFixed(2)}</td>
                  </tr>
                ))}
                <tr className="font-medium">
                  <td className="py-2 pr-4">Total</td>
                  <td className="py-2 pr-4">{total.count}</td>
                  <td className="py-2 pr-4" colSpan={3} />
                  <td className="py-2 pr-4">{total.credits}</td>
                  <td className="py-2">${total.costUsd.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
