import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, Download, Trash2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";

const ARCHIVED_TOPICS = [
  { id: 'c31d9371-24f4-4f26-9bd7-816f5ffdfbaa', name: 'Hastings' },
  { id: '7c38403c-6fb0-4eab-831e-de3b0817025e', name: 'AI in marcomms' },
  { id: '973deca3-17f3-4e5a-899a-fd4f26b90260', name: 'AI marketing in life science' },
  { id: '535cc489-20cd-4b3a-89e8-c7f0549bae8d', name: 'Outdoors' },
  { id: '1461de22-8dad-4ca3-8a20-9c2b5c4c7e06', name: 'Brighton news' },
  { id: 'e288fe0e-cb6b-4fd9-929e-469a14f3930c', name: 'Subcultural design' },
  { id: 'a375d196-16bf-4b46-846e-6cf8067de0f2', name: 'Lagos news' },
  { id: '0dc1da67-2975-4a42-af18-556ecb286398', name: 'Brighton' },
  { id: 'e9064e24-9a87-4de8-8dca-8091ce26fb8a', name: 'AI for agency' },
];

const PROTECTED_TOPICS = [
  { id: 'd224e606-1a4c-4713-8135-1d30e2d6d0c6', name: 'Eastbourne' },
  { id: '79fb5f44-47a3-493e-8b81-3ad8892cf69c', name: 'Kenilworth' },
  { id: '3f05c5a3-3196-455d-bff4-e9a9a20b8615', name: 'Medical device development' },
];

export function ArchivedTopicsCleanup() {
  const [loading, setLoading] = useState(false);
  const [backupComplete, setBackupComplete] = useState(false);
  const [deletionResults, setDeletionResults] = useState<any[]>([]);

  const handleBackup = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('backup-topics', {
        body: {
          topic_ids: ARCHIVED_TOPICS.map(t => t.id),
        },
      });

      if (error) throw error;

      // Download the backup as JSON
      const backupJson = JSON.stringify(data.backup_data, null, 2);
      const blob = new Blob([backupJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `archived-topics-backup-${new Date().toISOString()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setBackupComplete(true);
      toast.success('Backup downloaded successfully');
    } catch (error: any) {
      console.error('Backup error:', error);
      toast.error(error.message || 'Failed to backup topics');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);
    const results = [];

    try {
      for (const topic of ARCHIVED_TOPICS) {
        const { data, error } = await supabase.rpc('delete_topic_cascade', {
          p_topic_id: topic.id,
        });

        if (error) {
          results.push({ topic: topic.name, success: false, error: error.message });
        } else {
          results.push({ topic: topic.name, success: true, data });
        }
      }

      setDeletionResults(results);
      const successCount = results.filter(r => r.success).length;
      toast.success(`Deleted ${successCount}/${ARCHIVED_TOPICS.length} topics`);
    } catch (error: any) {
      console.error('Deletion error:', error);
      toast.error('Failed to delete topics');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Archived Topics Cleanup</CardTitle>
        <CardDescription>
          Backup and permanently delete {ARCHIVED_TOPICS.length} archived topics
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Protected Topics:</strong> {PROTECTED_TOPICS.map(t => t.name).join(', ')} will NOT be affected
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <h4 className="text-sm font-medium">Topics to be deleted:</h4>
          <ul className="text-sm text-muted-foreground space-y-1">
            {ARCHIVED_TOPICS.map(topic => (
              <li key={topic.id}>• {topic.name}</li>
            ))}
          </ul>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={handleBackup}
            disabled={loading || backupComplete}
            variant="outline"
          >
            <Download className="h-4 w-4 mr-2" />
            {backupComplete ? 'Backup Complete' : 'Download Backup'}
          </Button>

          <Button
            onClick={handleDelete}
            disabled={loading || !backupComplete || deletionResults.length > 0}
            variant="destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Topics
          </Button>
        </div>

        {deletionResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Deletion Results:</h4>
            <ul className="text-sm space-y-1">
              {deletionResults.map((result, idx) => (
                <li key={idx} className="flex items-center gap-2">
                  {result.success ? (
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-destructive" />
                  )}
                  <span>{result.topic}: {result.success ? 'Deleted' : result.error}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
