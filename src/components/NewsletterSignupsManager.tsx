import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download, Calendar, Mail, TrendingUp, Users } from 'lucide-react';
import { format } from 'date-fns';

interface EmailSubscriber {
  id: string;
  email: string;
  first_name: string | null;
  notification_type: 'daily' | 'weekly';
  created_at: string;
  is_active: boolean;
  is_verified: boolean;
  topic: {
    id: string;
    name: string;
  };
}

interface SubscriberStats {
  daily: number;
  weekly: number;
  total: number;
  signupsToday: number;
  signupsWeek: number;
}

interface NewsletterSignupsManagerProps {
  topicId?: string;
}

const getNotificationBadge = (type: string) => {
  switch (type) {
    case 'instant':
      return <Badge variant="default" className="text-xs">Instant</Badge>;
    case 'daily':
      return <Badge variant="secondary" className="text-xs bg-blue-500/10 text-blue-600 border-blue-200">Daily</Badge>;
    case 'weekly':
      return <Badge variant="outline" className="text-xs bg-purple-500/10 text-purple-600 border-purple-200">Weekly</Badge>;
    default:
      return <Badge variant="outline" className="text-xs">{type}</Badge>;
  }
};

export const NewsletterSignupsManager = ({ topicId }: NewsletterSignupsManagerProps) => {
  const [emailSubscribers, setEmailSubscribers] = useState<EmailSubscriber[]>([]);
  const [stats, setStats] = useState<SubscriberStats>({ daily: 0, weekly: 0, total: 0, signupsToday: 0, signupsWeek: 0 });
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSubscribers();
  }, [topicId]);

  const loadSubscribers = async () => {
    try {
      setLoading(true);
      
      // Load email subscribers
      let emailQuery = supabase
        .from('topic_newsletter_signups')
        .select(`
          id,
          email,
          first_name,
          notification_type,
          created_at,
          is_active,
          topics!inner (
            id,
            name
          )
        `)
        .eq('is_active', true)
        .not('email', 'is', null)
        .order('created_at', { ascending: false });

      if (topicId) {
        emailQuery = emailQuery.eq('topic_id', topicId);
      }

      const { data: emailData, error: emailError } = await emailQuery;

      if (emailError) throw emailError;

      const transformedEmailData = (emailData || []).map(signup => ({
        id: signup.id,
        email: signup.email!,
        first_name: (signup as any).first_name || null,
        notification_type: signup.notification_type as 'daily' | 'weekly',
        created_at: signup.created_at,
        is_active: signup.is_active,
        is_verified: true, // Assume verified if active
        topic: {
          id: (signup.topics as any).id,
          name: (signup.topics as any).name
        }
      }));

      setEmailSubscribers(transformedEmailData);

      // Calculate stats
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setUTCDate(weekAgo.getUTCDate() - 7);

      const dailyCount = transformedEmailData.filter(s => s.notification_type === 'daily').length;
      const weeklyCount = transformedEmailData.filter(s => s.notification_type === 'weekly').length;
      const signupsToday = transformedEmailData.filter(s => new Date(s.created_at) >= today).length;
      const signupsWeek = transformedEmailData.filter(s => new Date(s.created_at) >= weekAgo).length;

      setStats({
        daily: dailyCount,
        weekly: weeklyCount,
        total: transformedEmailData.length,
        signupsToday,
        signupsWeek
      });

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
      
      if (emailSubscribers.length === 0) {
        toast({
          title: "No data",
          description: "No subscribers to download",
          variant: "default"
        });
        return;
      }

      const headers = ['First Name', 'Email', 'Frequency', 'Topic', 'Verified', 'Subscribed Date'];
      const csvContent = [
        headers.join(','),
        ...emailSubscribers.map(sub => {
          return [
            `"${sub.first_name || ''}"`,
            `"${sub.email}"`,
            `"${sub.notification_type}"`,
            `"${sub.topic.name}"`,
            `"${sub.is_verified ? 'Yes' : 'No'}"`,
            `"${format(new Date(sub.created_at), 'yyyy-MM-dd HH:mm:ss')}"`
          ].join(',');
        })
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `email-subscribers-${format(new Date(), 'yyyy-MM-dd')}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: "Download complete",
        description: `Downloaded ${emailSubscribers.length} subscriber${emailSubscribers.length === 1 ? '' : 's'}`,
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
      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="bg-blue-500/5 border-blue-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-muted-foreground">Daily</span>
            </div>
            <p className="text-2xl font-bold text-blue-600 mt-1">{stats.daily}</p>
          </CardContent>
        </Card>
        <Card className="bg-purple-500/5 border-purple-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-purple-600" />
              <span className="text-sm text-muted-foreground">Weekly</span>
            </div>
            <p className="text-2xl font-bold text-purple-600 mt-1">{stats.weekly}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-200/50">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-muted-foreground">This Week</span>
            </div>
            <p className="text-2xl font-bold text-emerald-600 mt-1">+{stats.signupsWeek}</p>
          </CardContent>
        </Card>
        <Card className="bg-muted/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Total</span>
            </div>
            <p className="text-2xl font-bold mt-1">{stats.total}</p>
          </CardContent>
        </Card>
      </div>

      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {emailSubscribers.length === 0 
            ? "No email subscribers yet" 
            : `${emailSubscribers.length} email subscriber${emailSubscribers.length === 1 ? '' : 's'}`}
        </div>
        
        {emailSubscribers.length > 0 && (
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

      {/* Email Subscribers Table */}
      {emailSubscribers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
          <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
            <Mail className="w-8 h-8 text-muted-foreground/60" />
          </div>
          <h3 className="text-lg font-medium mb-2">No email subscribers yet</h3>
          <p className="text-sm text-muted-foreground max-w-md">
            When users subscribe to daily or weekly briefing emails, they'll appear here.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border bg-background/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subscriber</TableHead>
                <TableHead>Frequency</TableHead>
                {!topicId && <TableHead>Topic</TableHead>}
                <TableHead>Status</TableHead>
                <TableHead>Subscribed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {emailSubscribers.map((sub, index) => (
                <TableRow key={sub.id} className={index % 2 === 0 ? "bg-muted/20" : ""}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-xs font-semibold text-primary uppercase">
                          {sub.first_name ? sub.first_name.charAt(0) : sub.email.charAt(0)}
                        </span>
                      </div>
                      <div>
                        {sub.first_name && (
                          <div className="font-medium text-sm">{sub.first_name}</div>
                        )}
                        <div className={`truncate max-w-[180px] ${sub.first_name ? 'text-xs text-muted-foreground' : 'font-medium'}`}>
                          {sub.email}
                        </div>
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
                    {sub.is_verified ? (
                      <Badge variant="default" className="text-xs bg-emerald-500">Verified</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">Pending</Badge>
                    )}
                  </TableCell>
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
              ))}
            </TableBody>
          </Table>
        </div>
      )}

    </div>
  );
};