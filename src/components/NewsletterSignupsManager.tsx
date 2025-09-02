import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Mail, Calendar, User } from 'lucide-react';
import { format } from 'date-fns';

interface NewsletterSignup {
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
  const [signups, setSignups] = useState<NewsletterSignup[]>([]);
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
      console.error('Error loading newsletter signups:', error);
      toast({
        title: "Error",
        description: "Failed to load newsletter signups",
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
      const headers = ['Email', 'Name', 'Topic', 'Signup Date'];
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
      link.setAttribute('download', `newsletter-signups-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download complete",
        description: `Downloaded ${signups.length} newsletter signups`,
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-5 h-5" />
            Newsletter Signups
          </CardTitle>
          <CardDescription>Loading signups...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-12 bg-muted rounded" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Newsletter Signups
            </CardTitle>
            <CardDescription>
              {signups.length === 0 
                ? "No newsletter signups yet" 
                : `${signups.length} total signup${signups.length === 1 ? '' : 's'}`}
            </CardDescription>
          </div>
          
          {signups.length > 0 && (
            <Button
              onClick={downloadCSV}
              disabled={downloading}
              size="sm"
              className="gap-2"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Downloading...' : 'Download CSV'}
            </Button>
          )}
        </div>
      </CardHeader>
      
      <CardContent>
        {signups.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Mail className="w-12 h-12 mx-auto mb-2 opacity-50" />
            <p>No newsletter signups yet</p>
            <p className="text-sm">Signups will appear here when users subscribe to topic notifications</p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  {!topicId && <TableHead>Topic</TableHead>}
                  <TableHead>Signup Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {signups.map((signup) => (
                  <TableRow key={signup.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Mail className="w-4 h-4 text-muted-foreground" />
                        {signup.email}
                      </div>
                    </TableCell>
                    <TableCell>
                      {signup.name ? (
                        <div className="flex items-center gap-2">
                          <User className="w-4 h-4 text-muted-foreground" />
                          {signup.name}
                        </div>
                      ) : (
                        <span className="text-muted-foreground text-sm">Not provided</span>
                      )}
                    </TableCell>
                    {!topicId && (
                      <TableCell>
                        <Badge variant="secondary">{signup.topic.name}</Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Calendar className="w-4 h-4" />
                        {format(new Date(signup.created_at), 'MMM d, yyyy HH:mm')}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
};