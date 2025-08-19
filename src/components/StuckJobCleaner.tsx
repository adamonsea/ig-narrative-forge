import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Trash2, RotateCcw, AlertTriangle } from 'lucide-react';

interface StuckJob {
  id: string;
  article_id: string;
  title: string;
  status: string;
  attempts: number;
  error_message: string;
  created_at: string;
}

export const StuckJobCleaner = () => {
  const [stuckJobs, setStuckJobs] = useState<StuckJob[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchStuckJobs = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('reset-stuck-processing', {
        body: { action: 'get_stuck_items' }
      });
      
      if (response.error) throw response.error;
      
      // Get the stuck queue items with article details
      const { data: queueData, error: queueError } = await supabase
        .from('content_generation_queue')
        .select(`
          id,
          article_id,
          status,
          attempts,
          error_message,
          created_at,
          articles (title)
        `)
        .or('attempts.gte.3,and(status.eq.processing,created_at.lt.' + new Date(Date.now() - 10 * 60 * 1000).toISOString() + ')');

      if (queueError) throw queueError;

      const jobsWithTitles = queueData?.map(job => ({
        ...job,
        title: job.articles?.title || 'Unknown Article'
      })) || [];

      setStuckJobs(jobsWithTitles);
    } catch (error) {
      console.error('Error fetching stuck jobs:', error);
      toast({
        title: "Error",
        description: "Failed to fetch stuck jobs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const clearSpecificJob = async (jobId: string, articleId: string, title: string) => {
    try {
      // Direct database cleanup
      const { error: deleteError } = await supabase
        .from('content_generation_queue')
        .delete()
        .eq('id', jobId);

      if (deleteError) throw deleteError;

      // Reset any associated story back to draft
      const { error: resetError } = await supabase
        .from('stories')
        .update({ 
          status: 'draft',
          updated_at: new Date().toISOString()
        })
        .eq('article_id', articleId);

      if (resetError) {
        console.warn('Could not reset story status:', resetError);
      }

      toast({
        title: "Job Cleared",
        description: `Successfully cleared stuck job for "${title}"`,
      });
      
      // Refresh the list
      fetchStuckJobs();
    } catch (error) {
      console.error('Error clearing job:', error);
      toast({
        title: "Clear Failed",
        description: `Failed to clear job for "${title}"`,
        variant: "destructive",
      });
    }
  };

  const clearAllStuckJobs = async () => {
    try {
      const response = await supabase.functions.invoke('reset-stuck-processing', {
        body: { action: 'clear_stuck_queue' }
      });
      
      if (response.error) throw response.error;
      
      toast({
        title: "All Jobs Cleared",
        description: response.data?.message || "All stuck jobs have been cleared",
      });
      
      fetchStuckJobs();
    } catch (error) {
      console.error('Error clearing all jobs:', error);
      toast({
        title: "Clear Failed",
        description: "Failed to clear all stuck jobs",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          Stuck Job Manager
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Button onClick={fetchStuckJobs} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh Stuck Jobs'}
          </Button>
          <Button 
            onClick={clearAllStuckJobs}
            variant="destructive"
            className="flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Clear All Stuck
          </Button>
        </div>

        {stuckJobs.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Found {stuckJobs.length} stuck jobs:</h4>
            {stuckJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <p className="font-medium text-sm">{job.title}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="destructive">
                      {job.attempts}/3 attempts
                    </Badge>
                    <Badge variant="outline">
                      {job.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(job.created_at).toLocaleString()}
                    </span>
                  </div>
                  {job.error_message && (
                    <p className="text-xs text-red-600 mt-1 truncate">
                      {job.error_message}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => clearSpecificJob(job.id, job.article_id, job.title)}
                  className="flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </Button>
              </div>
            ))}
          </div>
        )}

        {stuckJobs.length === 0 && !loading && (
          <p className="text-muted-foreground text-center py-4">
            No stuck jobs found. Click "Refresh" to check again.
          </p>
        )}
      </CardContent>
    </Card>
  );
};