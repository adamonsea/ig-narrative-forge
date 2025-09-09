import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Bell, AlertTriangle, Info, AlertCircle, Archive, Trash2, Copy, Eye, EyeOff } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

interface ErrorTicket {
  id: string;
  ticket_type: string;
  source_info: any;
  error_details: string;
  error_code?: string;
  stack_trace?: string;
  context_data: any;
  status: string;
  severity: string;
  resolution_notes?: string;
  created_at: string;
  updated_at: string;
  archived_at?: string;
}

interface ErrorNotification {
  id: string;
  ticket_id: string;
  read_at?: string;
  created_at: string;
}

export default function ErrorTicketDashboard() {
  const [tickets, setTickets] = useState<ErrorTicket[]>([]);
  const [notifications, setNotifications] = useState<ErrorNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('active');
  const { toast } = useToast();

  const loadTickets = async () => {
    try {
      const { data, error } = await supabase
        .from('error_tickets')
        .select('*')
        .filter('archived_at', activeTab === 'active' ? 'is' : 'not.is', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTickets(data || []);
    } catch (error) {
      console.error('Error loading tickets:', error);
      toast({
        title: "Load Failed",
        description: "Failed to load error tickets",
        variant: "destructive"
      });
    }
  };

  const loadNotifications = async () => {
    try {
      const { data, error } = await supabase
        .from('error_notifications')
        .select('*')
        .is('read_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setNotifications(data || []);
    } catch (error) {
      console.error('Error loading notifications:', error);
    }
  };

  useEffect(() => {
    loadTickets();
    loadNotifications();
    setLoading(false);

    // Set up real-time subscription for new tickets
    const ticketSubscription = supabase
      .channel('error-tickets')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'error_tickets' },
        (payload) => {
          loadTickets();
          loadNotifications();
          // Show bell notification
          toast({
            title: "New Error Ticket",
            description: `${payload.new.ticket_type} error detected`,
            variant: "destructive"
          });
        }
      )
      .subscribe();

    return () => {
      ticketSubscription.unsubscribe();
    };
  }, [activeTab]);

  const updateTicketStatus = async (ticketId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('error_tickets')
        .update({ status })
        .eq('id', ticketId);

      if (error) throw error;
      loadTickets();
      toast({
        title: "Status Updated",
        description: `Ticket status changed to ${status}`
      });
    } catch (error) {
      console.error('Error updating status:', error);
      toast({
        title: "Update Failed",
        description: "Failed to update ticket status",
        variant: "destructive"
      });
    }
  };

  const archiveTicket = async (ticketId: string) => {
    try {
      const { error } = await supabase
        .from('error_tickets')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', ticketId);

      if (error) throw error;
      loadTickets();
      toast({
        title: "Ticket Archived",
        description: "Ticket has been archived"
      });
    } catch (error) {
      console.error('Error archiving ticket:', error);
      toast({
        title: "Archive Failed",
        description: "Failed to archive ticket",
        variant: "destructive"
      });
    }
  };

  const deleteTicket = async (ticketId: string) => {
    try {
      const { error } = await supabase
        .from('error_tickets')
        .delete()
        .eq('id', ticketId);

      if (error) throw error;
      loadTickets();
      toast({
        title: "Ticket Deleted",
        description: "Ticket has been permanently deleted"
      });
    } catch (error) {
      console.error('Error deleting ticket:', error);
      toast({
        title: "Delete Failed",
        description: "Failed to delete ticket",
        variant: "destructive"
      });
    }
  };

  const copyErrorDetails = (ticket: ErrorTicket) => {
    const details = `
Error ID: ${ticket.id}
Type: ${ticket.ticket_type}
Severity: ${ticket.severity}
Status: ${ticket.status}
Created: ${new Date(ticket.created_at).toLocaleString()}

Error Details:
${ticket.error_details}

${ticket.error_code ? `Error Code: ${ticket.error_code}\n` : ''}
${ticket.stack_trace ? `Stack Trace:\n${ticket.stack_trace}\n` : ''}

Source Info:
${JSON.stringify(ticket.source_info, null, 2)}

Context Data:
${JSON.stringify(ticket.context_data, null, 2)}
    `.trim();

    navigator.clipboard.writeText(details);
    toast({
      title: "Copied",
      description: "Error details copied to clipboard"
    });
  };

  const markNotificationRead = async (notificationId: string) => {
    try {
      const { error } = await supabase
        .from('error_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', notificationId);

      if (error) throw error;
      loadNotifications();
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'high': return <AlertCircle className="h-4 w-4 text-orange-500" />;
      case 'medium': return <Info className="h-4 w-4 text-yellow-500" />;
      default: return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'destructive';
      case 'high': return 'destructive';
      case 'medium': return 'default';
      default: return 'secondary';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new': return 'destructive';
      case 'current': return 'default';
      case 'testing': return 'secondary';
      case 'backlog': return 'outline';
      default: return 'secondary';
    }
  };

  // Sort tickets with backlog at bottom
  const sortedTickets = [...tickets].sort((a, b) => {
    if (a.status === 'backlog' && b.status !== 'backlog') return 1;
    if (b.status === 'backlog' && a.status !== 'backlog') return -1;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const unreadCount = notifications.length;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Error Monitoring</h2>
          {unreadCount > 0 && (
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-red-500 animate-pulse" />
              <Badge variant="destructive">{unreadCount} new</Badge>
            </div>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="active">Active Tickets</TabsTrigger>
          <TabsTrigger value="archived">Archived</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4">
          {sortedTickets.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                No {activeTab} error tickets found
              </CardContent>
            </Card>
          ) : (
            sortedTickets.map((ticket) => (
              <Card key={ticket.id} className={ticket.status === 'backlog' ? 'opacity-75' : ''}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {getSeverityIcon(ticket.severity)}
                      <div>
                        <CardTitle className="text-lg">
                          {ticket.ticket_type.charAt(0).toUpperCase() + ticket.ticket_type.slice(1)} Error
                        </CardTitle>
                        <p className="text-sm text-muted-foreground">
                          {new Date(ticket.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={getSeverityColor(ticket.severity)}>
                        {ticket.severity}
                      </Badge>
                      <Badge variant={getStatusColor(ticket.status)}>
                        {ticket.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h4 className="font-medium mb-2">Error Details</h4>
                    <p className="text-sm bg-muted p-3 rounded font-mono">
                      {ticket.error_details}
                    </p>
                  </div>

                  {ticket.error_code && (
                    <div>
                      <h4 className="font-medium mb-2">Error Code</h4>
                      <p className="text-sm bg-muted p-2 rounded font-mono">
                        {ticket.error_code}
                      </p>
                    </div>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <Select
                      value={ticket.status}
                      onValueChange={(value) => updateTicketStatus(ticket.id, value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">New</SelectItem>
                        <SelectItem value="current">Current</SelectItem>
                        <SelectItem value="testing">Testing</SelectItem>
                        <SelectItem value="backlog">Backlog</SelectItem>
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyErrorDetails(ticket)}
                    >
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Details
                    </Button>

                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Error Ticket Details</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <div>
                            <h4 className="font-medium mb-2">Source Info</h4>
                            <pre className="text-sm bg-muted p-3 rounded overflow-x-auto">
                              {JSON.stringify(ticket.source_info, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <h4 className="font-medium mb-2">Context Data</h4>
                            <pre className="text-sm bg-muted p-3 rounded overflow-x-auto">
                              {JSON.stringify(ticket.context_data, null, 2)}
                            </pre>
                          </div>
                          {ticket.stack_trace && (
                            <div>
                              <h4 className="font-medium mb-2">Stack Trace</h4>
                              <pre className="text-sm bg-muted p-3 rounded overflow-x-auto">
                                {ticket.stack_trace}
                              </pre>
                            </div>
                          )}
                        </div>
                      </DialogContent>
                    </Dialog>

                    {activeTab === 'active' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => archiveTicket(ticket.id)}
                      >
                        <Archive className="h-4 w-4 mr-2" />
                        Archive
                      </Button>
                    ) : (
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteTicket(ticket.id)}
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}