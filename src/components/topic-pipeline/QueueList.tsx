import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Clock, AlertCircle, XCircle, ExternalLink, Loader2 } from "lucide-react";

interface QueueItem {
  id: string;
  article_id: string;
  status: string;
  created_at: string;
  attempts: number;
  max_attempts: number;
  error_message: string | null;
  article: {
    title: string;
    source_url: string;
  };
}

interface QueueListProps {
  queueItems: QueueItem[];
  deletingQueueItems: Set<string>;
  onCancel: (queueId: string) => void;
  onRetry: (queueId: string) => void;
}

export const QueueList: React.FC<QueueListProps> = ({
  queueItems,
  deletingQueueItems,
  onCancel,
  onRetry
}) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'processing':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  if (queueItems.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Processing Jobs</CardTitle>
          <CardDescription>
            All articles are processed. New approvals will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {queueItems.map((item) => (
        <Card key={item.id} className="transition-all duration-200 hover:shadow-md">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  {getStatusIcon(item.status)}
                  <CardTitle className="text-base line-clamp-2">
                    {item.article.title}
                  </CardTitle>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                  <Badge variant="outline" className={getStatusColor(item.status)}>
                    {item.status.toUpperCase()}
                  </Badge>
                  <span>
                    Attempt {item.attempts}/{item.max_attempts}
                  </span>
                  <span>
                    Queued {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                </div>

                {item.error_message && (
                  <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    <div className="font-medium">Error:</div>
                    <div className="mt-1">{item.error_message}</div>
                  </div>
                )}
              </div>
              
              <div className="flex flex-col gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => window.open(item.article.source_url, '_blank')}
                >
                  <ExternalLink className="w-4 h-4" />
                </Button>
                
                <div className="flex gap-1">
                  {item.status === 'failed' && item.attempts < item.max_attempts && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onRetry(item.id)}
                    >
                      Retry
                    </Button>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onCancel(item.id)}
                    disabled={deletingQueueItems.has(item.id)}
                  >
                    {deletingQueueItems.has(item.id) ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <XCircle className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
};