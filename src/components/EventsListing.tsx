import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, ExternalLink, RefreshCw, AlertCircle, Trash2, Clock, Tag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isToday, isTomorrow, isWithinInterval, addDays } from "date-fns";

interface Event {
  id: string;
  title: string;
  description: string;
  start_date: string;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  source_url: string | null;
  source_name: string | null;
  event_type: string;
  category: string | null;
  price: string | null;
  rank_position: number;
}

interface EventsListingProps {
  topicId: string;
}

const EventsListing: React.FC<EventsListingProps> = ({ topicId }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  const loadEvents = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_topic_events', {
        topic_id_param: topicId
      });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
      toast({
        title: "Error",
        description: "Failed to load events",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (topicId) {
      loadEvents();
    }
  }, [topicId]);

  const handleDeleteEvent = async (eventId: string) => {
    setDeleting(prev => new Set([...prev, eventId]));
    
    try {
      const { data, error } = await supabase.rpc('delete_event_with_backfill', {
        event_id_param: eventId
      });

      if (error) throw error;

      toast({
        title: "Event Deleted",
        description: data?.[0]?.message || "Event deleted successfully"
      });

      // Reload events to show updated ranking
      await loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive"
      });
    } finally {
      setDeleting(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  };

  const formatEventDate = (startDate: string, endDate: string | null) => {
    const start = new Date(startDate);
    const end = endDate ? new Date(endDate) : null;
    
    if (isToday(start)) {
      return "Today";
    } else if (isTomorrow(start)) {
      return "Tomorrow";
    } else if (isWithinInterval(start, { start: new Date(), end: addDays(new Date(), 7) })) {
      return format(start, "EEEE"); // Day name
    } else {
      if (end && format(start, 'yyyy-MM-dd') !== format(end, 'yyyy-MM-dd')) {
        return `${format(start, 'MMM d')} - ${format(end, 'MMM d')}`;
      }
      return format(start, 'MMM d');
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    const colors = {
      'music': 'bg-purple-100 text-purple-800',
      'comedy': 'bg-yellow-100 text-yellow-800',
      'shows': 'bg-blue-100 text-blue-800',
      'musicals': 'bg-pink-100 text-pink-800',
      'events': 'bg-green-100 text-green-800',
      'art_exhibitions': 'bg-orange-100 text-orange-800'
    };
    
    return (
      <Badge 
        variant="secondary" 
        className={colors[eventType as keyof typeof colors] || 'bg-gray-100 text-gray-800'}
      >
        {eventType.replace('_', ' ')}
      </Badge>
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="text-center py-8">
          <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin opacity-50" />
          <p className="text-muted-foreground">Loading events...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">Upcoming Events</h3>
          <p className="text-sm text-muted-foreground">
            Events collected from various API sources (showing next week)
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={loadEvents}
          disabled={loading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {events.length === 0 ? (
        <Card>
          <CardContent className="text-center py-8 text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No upcoming events found</p>
            <p className="text-sm mt-2">Generate events from the Management → Automation section</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex-1 space-y-2">
                    <div className="flex items-start gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-sm">{event.title}</h4>
                          {getEventTypeBadge(event.event_type)}
                          <Badge variant="outline" className="text-xs">
                            #{event.rank_position}
                          </Badge>
                        </div>
                        
                        {event.description && (
                          <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                            {event.description}
                          </p>
                        )}
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatEventDate(event.start_date, event.end_date)}
                            </div>

                            {event.start_time && (
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {event.start_time.slice(0, 5)}
                                {event.end_time && ` - ${event.end_time.slice(0, 5)}`}
                              </div>
                            )}

                            {event.price && (
                              <div className="flex items-center gap-1 font-medium text-green-600">
                                <Tag className="h-3 w-3" />
                                {event.price}
                              </div>
                            )}
                          </div>
                          
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            {event.location && (
                              <div className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {event.location}
                              </div>
                            )}
                            
                            {event.category && (
                              <Badge variant="outline" className="text-xs h-5">
                                {event.category}
                              </Badge>
                            )}
                            
                            {event.source_name && (
                              <div className="text-xs">
                                Source: {event.source_name}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-1">
                        {event.source_url && (
                          <Button variant="ghost" size="sm" asChild>
                            <a 
                              href={event.source_url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="h-8 w-8 p-0"
                            >
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </Button>
                        )}
                        
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEvent(event.id)}
                          disabled={deleting.has(event.id)}
                          className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                        >
                          {deleting.has(event.id) ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventsListing;