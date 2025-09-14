import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Calendar, RefreshCw, Settings, Sparkles, Trash2, Eye, Clock, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface AiEventsManagerProps {
  topicId: string;
  topicName: string;
  region?: string;
}

interface Event {
  id: string;
  title: string;
  description?: string;
  start_date: string;
  location?: string;
  event_type: string;
  price?: string;
  rank_position: number;
  source_name?: string;
}

const AiEventsManager: React.FC<AiEventsManagerProps> = ({ topicId, topicName, region }) => {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['events', 'music', 'comedy', 'shows']);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const { toast } = useToast();

  const eventTypes = [
    { id: 'events', label: 'Community Events', description: 'Local gatherings, markets, fairs' },
    { id: 'music', label: 'Music Events', description: 'Concerts, festivals, live music' },
    { id: 'comedy', label: 'Comedy Shows', description: 'Stand-up, comedy nights' },
    { id: 'shows', label: 'Theater & Shows', description: 'Plays, performances, entertainment' },
    { id: 'art_exhibitions', label: 'Art & Culture', description: 'Galleries, exhibitions, cultural events' },
    { id: 'musicals', label: 'Musicals', description: 'Musical theater and performances' }
  ];

  useEffect(() => {
    loadEvents();
  }, [topicId]);

  const loadEvents = async () => {
    try {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('topic_id', topicId)
        .eq('status', 'published')
        .order('rank_position', { ascending: true });

      if (error) throw error;
      setEvents(data || []);
    } catch (error) {
      console.error('Error loading events:', error);
    }
  };

  const handleTypeToggle = (typeId: string) => {
    setSelectedTypes(prev => 
      prev.includes(typeId) 
        ? prev.filter(id => id !== typeId)
        : [...prev, typeId]
    );
  };

  const collectEvents = async () => {
    try {
      setLoading(true);
      setProgress(0);
      setProgressMessage('Initializing AI event collection...');

      setProgress(20);
      setProgressMessage('Generating events with AI...');

      const { data, error } = await supabase.functions.invoke('ai-event-generator', {
        body: {
          topicId,
          region: region || topicName,
          eventTypes: selectedTypes
        }
      });

      if (error) throw error;

      setProgress(80);
      setProgressMessage('Validating and organizing events...');

      await new Promise(resolve => setTimeout(resolve, 1000)); // Show progress

      setProgress(100);
      setProgressMessage('Events collected successfully!');

      toast({
        title: "AI Events Collected Successfully",
        description: `Generated ${data.events?.length || 0} high-quality events using AI curation`
      });

      await loadEvents();

    } catch (error) {
      console.error('Error collecting events:', error);
      toast({
        title: "Error",
        description: "Failed to collect events with AI",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  const deleteEvent = async (eventId: string, eventTitle: string) => {
    if (!confirm(`Delete "${eventTitle}"?`)) return;

    try {
      const { error } = await supabase
        .from('events')
        .update({ status: 'deleted' })
        .eq('id', eventId);

      if (error) throw error;

      toast({
        title: "Event Deleted",
        description: `Removed "${eventTitle}" from your events`
      });

      await loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive"
      });
    }
  };

  const getEventTypeColor = (eventType: string) => {
    switch (eventType) {
      case 'music': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'comedy': return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'shows': return 'bg-pink-100 text-pink-700 border-pink-200';
      case 'musicals': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'art_exhibitions': return 'bg-green-100 text-green-700 border-green-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-purple-500" />
          <div>
            <CardTitle className="text-lg">AI Event Collection</CardTitle>
            <CardDescription>
              Generate high-quality events using advanced AI curation - finds both popular events and hidden gems
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Progress Indicator */}
        {loading && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground text-center">{progressMessage}</p>
          </div>
        )}

        {/* Event Types Configuration */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Event Categories to Generate
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {eventTypes.map((type) => (
              <div key={type.id} className="flex items-start space-x-3">
                <Checkbox
                  id={type.id}
                  checked={selectedTypes.includes(type.id)}
                  onCheckedChange={() => handleTypeToggle(type.id)}
                />
                <div className="grid gap-1.5 leading-none">
                  <label
                    htmlFor={type.id}
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    {type.label}
                  </label>
                  <p className="text-xs text-muted-foreground">
                    {type.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collection Settings */}
        <div className="bg-gradient-to-r from-purple-50 to-blue-50 p-4 rounded-lg border border-purple-200">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-600" />
            AI Curation Settings
          </h4>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex justify-between">
              <span>Region:</span>
              <Badge variant="outline">{region || topicName}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Time Range:</span>
              <span>Next 7 days</span>
            </div>
            <div className="flex justify-between">
              <span>Selected Categories:</span>
              <span>{selectedTypes.length} categories</span>
            </div>
            <div className="flex justify-between">
              <span>AI Focus:</span>
              <span>Popular events + Hidden gems</span>
            </div>
          </div>
        </div>

        {/* Recent Events Pool */}
        {events.length > 0 && (
          <div>
            <h4 className="font-medium mb-3 flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Recent Event Collection ({events.length} events)
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {events.slice(0, 10).map((event) => (
                <div key={event.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getEventTypeColor(event.event_type)}`}
                      >
                        {event.event_type}
                      </Badge>
                      <span className="text-sm font-medium">{event.title}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(event.start_date).toLocaleDateString()}</span>
                      {event.location && <span>• {event.location}</span>}
                      {event.price && <span>• {event.price}</span>}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => deleteEvent(event.id, event.title)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collection Button */}
        <div className="flex gap-3">
          <Button 
            onClick={collectEvents}
            disabled={loading || selectedTypes.length === 0}
            className="flex-1"
          >
            {loading ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Generating with AI...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Generate Events with AI ({selectedTypes.length} categories)
              </>
            )}
          </Button>
        </div>

        {selectedTypes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            Please select at least one event category to generate events
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default AiEventsManager;