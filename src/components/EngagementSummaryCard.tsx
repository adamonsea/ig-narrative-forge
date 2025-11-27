import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Heart, MousePointer, Share2 } from 'lucide-react';

interface EngagementSummaryCardProps {
  liked: number;
  swiped: number;
  shared: number;
}

export const EngagementSummaryCard = ({ liked, swiped, shared }: EngagementSummaryCardProps) => {
  const total = liked + swiped + shared;
  const maxValue = Math.max(liked, swiped, shared, 1);
  
  const metrics = [
    { 
      label: 'Liked', 
      value: liked, 
      icon: Heart, 
      color: 'text-rose-500',
      fillColor: 'fill-rose-500',
      barColor: 'bg-rose-500'
    },
    { 
      label: 'Swiped', 
      value: swiped, 
      icon: MousePointer, 
      color: 'text-blue-500',
      fillColor: '',
      barColor: 'bg-blue-500'
    },
    { 
      label: 'Shared', 
      value: shared, 
      icon: Share2, 
      color: 'text-purple-500',
      fillColor: '',
      barColor: 'bg-purple-500'
    },
  ];

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-foreground">Engagement</h3>
          <span className="text-xs text-muted-foreground">{total} total</span>
        </div>
        <div className="space-y-3">
          {metrics.map((metric) => {
            const percentage = maxValue > 0 ? (metric.value / maxValue) * 100 : 0;
            const Icon = metric.icon;
            return (
              <div key={metric.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${metric.color} ${metric.fillColor}`} />
                    <span className="text-muted-foreground">{metric.label}</span>
                  </div>
                  <span className="font-semibold text-foreground">{metric.value}</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${metric.barColor} rounded-full transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
};