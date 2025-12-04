import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Calendar, Bell, Smartphone, Monitor } from 'lucide-react';
import { format } from 'date-fns';

interface PushSubscriber {
  id: string;
  notification_type: 'instant' | 'daily' | 'weekly';
  push_endpoint: string;
  created_at: string;
  is_active: boolean;
  topic: {
    id: string;
    name: string;
  };
}

interface NewsletterSignupsManagerProps {
  topicId?: string;
}

// Detect device/browser from push endpoint
const getDeviceInfo = (endpoint: string): { icon: typeof Smartphone; label: string } => {
  if (endpoint.includes('apple.com')) {
    return { icon: Smartphone, label: 'Safari/iOS' };
  }
  if (endpoint.includes('fcm.googleapis.com')) {
    return { icon: Monitor, label: 'Chrome/Android' };
  }
  if (endpoint.includes('mozilla.com')) {
    return { icon: Monitor, label: 'Firefox' };
  }
  return { icon: Monitor, label: 'Browser' };
};

const getNotificationBadge = (type: string) => {
  switch (type) {
    case 'instant':
      return <Badge variant="default" className="text-xs">Instant</Badge>;
    case 'daily':
      return <Badge variant="secondary" className="text-xs">Daily</Badge>;
    case 'weekly':
      return <Badge variant="outline" className="text-xs">Weekly</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
};

export const NewsletterSignupsManager = ({ topicId }: NewsletterSignupsManagerProps) => {
  const [subscribers, setSubscribers] = useState<PushSubscriber[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSubscribers();
  }, [topicId]);

  const loadSubscribers = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('topic_newsletter_signups')
        .select(`
          id,
          notification_type,
          push_subscription,
          created_at,
          is_active,
          topics!inner (
            id,
            name
          )
        `)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (topicId) {
        query = query.eq('topic_id', topicId);
      }

      const { data, error } = await query;

      if (error) throw error;

      const transformedData = (data || []).map(signup => ({
        id: signup.id,
        notification_type: signup.notification_type as 'instant' | 'daily' | 'weekly',
        push_endpoint: (signup.push_subscription as any)?.endpoint || '',
        created_at: signup.created_at,
        is_active: signup.is_active,
        topic: {
          id: (signup.topics as any).id,
          name: (signup.topics as any).name
        }
      }));

      setSubscribers(transformedData);
    } catch (error) {
      console.error('Error loading push subscribers:', error);
      toast({
        title: "Error",
        description: "Failed to load push subscribers",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = async () => {
    try {
      setDownloading(true);
      
      if (subscribers.length === 0) {
        toast({
          title: "No data",
          description: "No subscribers to download",
          variant: "default"
        });
        return;
      }

      const headers = ['Device', 'Notification Type', 'Topic', 'Subscribed Date'];
      const csvContent = [
        headers.join(','),
        ...subscribers.map(sub => {
          const device = getDeviceInfo(sub.push_endpoint);
          return [
            `"${device.label}"`,
            `"${sub.notification_type}"`,
            `"${sub.topic.name}"`,
            `"${format(new Date(sub.created_at), 'yyyy-MM-dd HH:mm:ss')}"`
          ].join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `push-subscribers-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download complete",
        description: `Downloaded ${subscribers.length} subscriber${subscribers.length === 1 ? '' : 's'}`,
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
      <div className="space-y-4">
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
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {subscribers.length === 0 
            ? "No push subscribers yet" 
            : `${subscribers.length} device${subscribers.length === 1 ? '' : 's'} subscribed to push notifications`}
        </div>
        
        {subscribers.length > 0 && (
          <Button
            onClick={downloadCSV}
            disabled={downloading}
            size="sm"
            variant="outline"
            className="gap-2"
          >
            <Download className="w-4 h-4" />
            {downloading ? 'Downloading...' : 'Export CSV'}
          </Button>
        )}
      </div>

      {/* Content Section */}
      {subscribers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Bell className="w-8 h-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-lg font-medium mb-2">No push subscribers yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            When users enable push notifications for this topic, they'll appear here. 
            Subscribers get notified when fresh content is published.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Type</TableHead>
                {!topicId && <TableHead>Topic</TableHead>}
                <TableHead>Subscribed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subscribers.map((sub, index) => {
                const device = getDeviceInfo(sub.push_endpoint);
                const DeviceIcon = device.icon;
                
                return (
                  <TableRow key={sub.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                          <DeviceIcon className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <div className="font-medium">{device.label}</div>
                          <div className="text-xs text-muted-foreground">Push notifications</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getNotificationBadge(sub.notification_type)}
                    </TableCell>
                    {!topicId && (
                      <TableCell>
                        <Badge variant="secondary" className="font-medium">
                          {sub.topic.name}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <div>
                          <div className="font-medium">
                            {format(new Date(sub.created_at), 'MMM d, yyyy')}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(new Date(sub.created_at), 'HH:mm')}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};