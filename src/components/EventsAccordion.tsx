import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Calendar, MapPin, ExternalLink, Trash2, Clock, Tag } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';

interface Event {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  location?: string;
  source_url?: string;
  source_name?: string;
  event_type: string;
  category?: string;
  price?: string;
  rank_position: number;
}

interface EventsAccordionProps {
  topicId: string;
  isOwner?: boolean;
}

export const EventsAccordion: React.FC<EventsAccordionProps> = ({ topicId, isOwner = false }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingEvents, setDeletingEvents] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadEvents();
  }, [topicId]);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .rpc('get_topic_events', { topic_id_param: topicId });

      if (error) throw error;
      
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: 'Error',
        description: 'Failed to load events',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    if (!isOwner) return;
    
    if (!confirm(`Are you sure you want to delete "${eventTitle}"?`)) {
      return;
    }

    setDeletingEvents(prev => new Set([...prev, eventId]));

    try {
      const { data, error } = await supabase
        .rpc('delete_event_with_backfill', { event_id_param: eventId });

      if (error) throw error;

      const result = data?.[0];
      if (!result?.success) {
        throw new Error(result?.message || 'Failed to delete event');
      }

      toast({
        title: 'Event Deleted',
        description: result.message,
      });

      // Reload events to show the backfill
      await loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete event',
        variant: 'destructive',
      });
    } finally {
      setDeletingEvents(prev => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'music':
        return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'comedy':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'shows':
        return 'bg-pink-100 text-pink-700 border-pink-200';
      case 'musicals':
        return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'art_exhibitions':
        return 'bg-green-100 text-green-700 border-green-200';
      default:
        return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (events.length === 0) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            This Week&apos;s Events
          </CardTitle>
          <CardDescription>
            No events found for this week
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="w-5 h-5" />
          This Week&apos;s Events ({events.length})
        </CardTitle>
        <CardDescription>
          Discover what&apos;s happening in your area
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="events">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-2">
                <span>View Events</span>
                <Badge variant="secondary">{events.length} events</Badge>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4 pt-2">
                {events.map((event) => (
                  <div key={event.id} className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge 
                            variant="outline" 
                            className={getEventTypeColor(event.event_type)}
                          >
                            {event.event_type.replace('_', ' ')}
                          </Badge>
                          <div className="flex items-center gap-1 text-sm text-muted-foreground">
                            <Calendar className="w-3 h-3" />
                            <span>{format(new Date(event.start_date), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                        <h4 className="font-medium mb-1">{event.title}</h4>
                        {event.description && (
                          <p className="text-sm text-muted-foreground mb-2">{event.description}</p>
                        )}
                        {event.location && (
                          <div className="flex items-center gap-1 text-sm text-muted-foreground mb-2">
                            <MapPin className="w-3 h-3" />
                            <span>{event.location}</span>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 ml-4">
                        {event.source_url && (
                          <Button
                            size="sm"
                            variant="outline"
                            asChild
                          >
                            <a
                              href={event.source_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1"
                            >
                              <ExternalLink className="w-3 h-3" />
                              Details
                            </a>
                          </Button>
                        )}
                        {isOwner && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteEvent(event.id, event.title)}
                            disabled={deletingEvents.has(event.id)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                    {event.source_name && (
                      <div className="text-xs text-muted-foreground">
                        Source: {event.source_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  );
};