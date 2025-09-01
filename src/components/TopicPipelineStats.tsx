import { useState, useEffect } from 'react';
import { useTopicPipeline } from '@/hooks/useTopicPipeline';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { FileText, Clock, CheckCircle } from 'lucide-react';

interface TopicPipelineStatsProps {
  topicId: string;
}

export const TopicPipelineStats = ({ topicId }: TopicPipelineStatsProps) => {
  const { stats } = useTopicPipeline(topicId);

  return (
    <>
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Pending</CardTitle>
          <FileText className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-primary">{stats.pending_articles}</div>
          <p className="text-xs text-muted-foreground">Pending articles</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-950/20 dark:to-orange-900/20 border-orange-200 dark:border-orange-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Processing</CardTitle>
          <Clock className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">{stats.processing_queue}</div>
          <p className="text-xs text-muted-foreground">In queue</p>
        </CardContent>
      </Card>

      <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-950/20 dark:to-green-900/20 border-green-200 dark:border-green-800">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Ready</CardTitle>
          <CheckCircle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-green-600 dark:text-green-400">{stats.ready_stories}</div>
          <p className="text-xs text-muted-foreground">Ready stories</p>
        </CardContent>
      </Card>
    </>
  );
};