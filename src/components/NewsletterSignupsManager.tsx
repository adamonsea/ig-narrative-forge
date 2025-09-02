import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Mail, Calendar, User, Bell } from 'lucide-react';
import { format } from 'date-fns';

interface TopicSubscriber {
  id: string;
  email: string;
  name: string | null;
  created_at: string;
  topic: {
    id: string;
    name: string;
  };
}

interface NewsletterSignupsManagerProps {
  topicId?: string;
}

export const NewsletterSignupsManager = ({ topicId }: NewsletterSignupsManagerProps) => {
  const [signups, setSignups] = useState<TopicSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSignups();
  }, [topicId]);

  const loadSignups = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('topic_newsletter_signups')
        .select(`
          id,
          email,
          name,
          created_at,
          topics!inner (
            id,
            name
          )
        `)
        .order('created_at', { ascending: false });

      if (topicId) {
        query = query.eq('topic_id', topicId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transformedData = (data || []).map(signup => ({
        id: signup.id,
        email: signup.email,
        name: signup.name,
        created_at: signup.created_at,
        topic: {
          id: signup.topics.id,
          name: signup.topics.name
        }
      }));

      setSignups(transformedData);
    } catch (error) {
      console.error('Error loading subscribers:', error);
      toast({
        title: "Error",
        description: "Failed to load subscribers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async () => {
    try {
      setDownloading(true);
      
      if (signups.length === 0) {
        toast({
          title: "No data",
          description: "No signups to download",
          variant: "default"
        });
        return;
      }

      // Create CSV content
      const headers = ['Email', 'Name', 'Topic', 'Subscription Date'];
      const csvContent = [
        headers.join(','),
        ...signups.map(signup => [
          `"${signup.email}"`,
          `"${signup.name || 'Not provided'}"`,
          `"${signup.topic.name}"`,
          `"${format(new Date(signup.created_at), 'yyyy-MM-dd HH:mm:ss')}"`
        ].join(','))
      ].join('\n');

      // Create and download blob
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `topic-subscribers-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download complete",
        description: `Downloaded ${signups.length} subscriber${signups.length === 1 ? '' : 's'}`,
        variant: "default"
      });
    } catch (error) {
      console.error('Error downloading CSV:', error);
      toast({
        title: "Error",
        description: "Failed to download CSV file",
        variant: "destructive"
      });
    } finally {
      setDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Bell className="w-5 h-5 text-primary animate-pulse" />
            </div>
            <div>
              <div className="h-6 w-32 bg-muted rounded animate-pulse mb-1" />
              <div className="h-4 w-48 bg-muted/50 rounded animate-pulse" />
            </div>
          </div>
        </div>
        
        <div className="rounded-lg border bg-card">
          <div className="p-6 space-y-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-lg bg-muted/30 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-48 bg-muted rounded" />
                  <div className="h-3 w-32 bg-muted/50 rounded" />
                </div>
                <div className="h-3 w-24 bg-muted/50 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Bell className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight">Topic Subscribers</h2>
            <p className="text-sm text-muted-foreground">
              {signups.length === 0 
                ? "No subscribers yet" 
                : `${signups.length} subscriber${signups.length === 1 ? '' : 's'} signed up for notifications`}
            </p>
          </div>
        </div>
        
        {signups.length > 0 && (
          <Button
            onClick={downloadCSV}
            disabled={downloading}
            className="gap-2"
            variant="outline"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Downloading...' : 'Export CSV'}
          </Button>
        )}
      </div>

      {/* Content Section */}
      <div className="rounded-lg border bg-card shadow-sm">
        {signups.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <Bell className="w-8 h-8 text-muted-foreground/60" />
            </div>
            <h3 className="text-lg font-medium mb-2">No subscribers yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              When users subscribe to notifications for this topic, they'll appear here. 
              Subscribers get notified when fresh content is published.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-b">
                  <TableHead className="font-medium">Subscriber</TableHead>
                  <TableHead className="font-medium">Name</TableHead>
                  {!topicId && <TableHead className="font-medium">Topic</TableHead>}
                  <TableHead className="font-medium">Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.map((signup, index) => (
                  <TableRow key={signup.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <Mail className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{signup.email}</div>
                          <div className="text-xs text-muted-foreground">Email notifications</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {signup.name ? (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          <span className="font-medium">{signup.name}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm italic">Name not provided</span>
                      )}
                    </TableCell>
                    {!topicId && (
                      <TableCell>
                        <Badge variant="secondary" className="font-medium">
                          {signup.topic.name}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {format(new Date(signup.created_at), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(signup.created_at), 'HH:mm')}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
};