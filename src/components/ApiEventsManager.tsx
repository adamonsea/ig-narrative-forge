import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar, RefreshCw, Settings, ExternalLink, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ApiEventsManagerProps {
  topicId: string;
  topicName: string;
  region?: string;
}

const ApiEventsManager: React.FC<ApiEventsManagerProps> = ({ topicId, topicName, region }) => {
  const [loading, setLoading] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['events', 'music', 'comedy', 'shows']);
  const { toast } = useToast();

  const eventTypes = [
    { id: 'events', label: 'Community Events', description: 'Local gatherings, markets, fairs' },
    { id: 'music', label: 'Music Events', description: 'Concerts, festivals, live music' },
    { id: 'comedy', label: 'Comedy Shows', description: 'Stand-up, comedy nights' },
    { id: 'shows', label: 'Theater & Shows', description: 'Plays, performances, entertainment' },
    { id: 'art_exhibitions', label: 'Art & Culture', description: 'Galleries, exhibitions, cultural events' },
    { id: 'musicals', label: 'Musicals', description: 'Musical theater and performances' }
  ];

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

      const { data, error } = await supabase.functions.invoke('api-event-collector', {
        body: {
          topicId,
          region: region || topicName,
          eventTypes: selectedTypes
        }
      });

      if (error) throw error;

      toast({
        title: "Events Collected Successfully",
        description: `Found ${data.eventsInserted} events from ${data.sources.length} API sources`
      });

    } catch (error) {
      console.error('Error collecting events:', error);
      toast({
        title: "Error",
        description: "Failed to collect events from API sources",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          <div>
            <CardTitle className="text-lg">API Event Collection</CardTitle>
            <CardDescription>
              Collect real events from various API sources and event platforms
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Event Types Configuration */}
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Event Categories to Collect
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
        <div className="bg-muted/50 p-4 rounded-lg">
          <h4 className="font-medium mb-2 flex items-center gap-2">
            <MapPin className="h-4 w-4" />
            Collection Settings
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
          </div>
        </div>

        {/* API Sources Info */}
        <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
          <h4 className="font-medium text-blue-900 mb-2 flex items-center gap-2">
            <ExternalLink className="h-4 w-4" />
            Connected API Sources
          </h4>
          <div className="space-y-1 text-sm text-blue-800">
            <div>• Eventbrite API - Ticketed events and activities</div>
            <div>• Local Venue APIs - Direct venue event feeds</div>
            <div>• Meetup API - Community gatherings and groups</div>
            <div>• Arts Council APIs - Cultural events and exhibitions</div>
          </div>
        </div>

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
                Collecting Events...
              </>
            ) : (
              <>
                <Calendar className="h-4 w-4 mr-2" />
                Collect Events ({selectedTypes.length} categories)
              </>
            )}
          </Button>
        </div>

        {selectedTypes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center">
            Please select at least one event category to collect events
          </p>
        )}
      </CardContent>
    </Card>
  );
};

export default ApiEventsManager;