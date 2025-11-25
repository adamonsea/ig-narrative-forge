import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface OrphanedStory {
  id: string;
  title: string;
  created_at: string;
  is_published: boolean;
  status: string;
  topic_article_id: string | null;
  article_id: string | null;
  reason: string;
}

interface OrphanedStoriesMonitorProps {
  topicId: string;
}

export function OrphanedStoriesMonitor({ topicId }: OrphanedStoriesMonitorProps) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    total_published: number;
    in_feed: number;
    orphaned: number;
    orphaned_stories: OrphanedStory[];
  } | null>(null);
  const { toast } = useToast();

  const runCheck = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('detect-orphaned-stories', {
        body: { topic_id: topicId },
      });

      if (error) throw error;

      setResults(data);
      
      if (data.orphaned > 0) {
        toast({
          title: "⚠️ Orphaned Stories Detected",
          description: `Found ${data.orphaned} published stories not appearing in feed`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "✓ All Stories Accounted For",
          description: "No orphaned stories detected",
        });
      }
    } catch (error: any) {
      console.error('Orphaned stories check error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to check for orphaned stories",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          Feed Health Monitor
        </CardTitle>
        <CardDescription>
          Check for published stories that aren't appearing in the main feed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={runCheck} disabled={loading}>
          {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Run Health Check
        </Button>

        {results && (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold">{results.total_published}</div>
                <div className="text-sm text-muted-foreground">Published Stories</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className="text-2xl font-bold text-green-600">{results.in_feed}</div>
                <div className="text-sm text-muted-foreground">In Feed</div>
              </div>
              <div className="text-center p-4 bg-muted rounded-lg">
                <div className={`text-2xl font-bold ${results.orphaned > 0 ? 'text-destructive' : 'text-green-600'}`}>
                  {results.orphaned}
                </div>
                <div className="text-sm text-muted-foreground">Orphaned</div>
              </div>
            </div>

            {results.orphaned > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                  Orphaned Stories
                </h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {results.orphaned_stories.map((story) => (
                    <div key={story.id} className="p-3 border rounded-lg space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="font-medium line-clamp-1">{story.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(story.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Badge variant="destructive">{story.reason}</Badge>
                      </div>
                      <div className="text-xs space-y-1">
                        <div>Status: <Badge variant="outline">{story.status}</Badge></div>
                        <div>Story ID: <code className="text-xs">{story.id}</code></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {results.orphaned === 0 && (
              <div className="flex items-center gap-2 text-green-600 p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">All published stories are appearing in the feed</span>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
