import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { 
  Calendar, 
  RefreshCw, 
  Settings, 
  ExternalLink, 
  Trash2, 
  CheckCircle, 
  AlertCircle,
  Clock,
  Target,
  Zap,
  Globe
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

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
  validation_status?: 'valid' | 'broken' | 'timeout' | null;
  last_validated_at?: string;
}

interface EventPreference {
  event_type: string;
  is_enabled: boolean;
}

interface EnhancedEventsManagerProps {
  topicId: string;
  topicName: string;
}

const EVENT_TYPES = [
  { value: 'events', label: 'General Events' },
  { value: 'music', label: 'Music & Concerts' },
  { value: 'comedy', label: 'Comedy Shows' },
  { value: 'shows', label: 'Theatre & Shows' },
  { value: 'musicals', label: 'Musicals' },
  { value: 'art_exhibitions', label: 'Art & Exhibitions' }
];

export const EnhancedEventsManager: React.FC<EnhancedEventsManagerProps> = ({ topicId, topicName }) => {
  const [events, setEvents] = useState<Event[]>([]);
  const [preferences, setPreferences] = useState<EventPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [validating, setValidating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [validationProgress, setValidationProgress] = useState(0);
  const [deletingEvents, setDeletingEvents] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    loadEvents();
    loadPreferences();
  }, [topicId]);

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

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('topic_event_preferences')
        .select('event_type, is_enabled')
        .eq('topic_id', topicId);

      if (error) throw error;

      if (data && data.length > 0) {
        setPreferences(data);
      } else {
        // Initialize with all types enabled
        const defaultPrefs = EVENT_TYPES.map(type => ({
          event_type: type.value,
          is_enabled: true
        }));
        setPreferences(defaultPrefs);
      }
    } catch (error) {
      console.error('Error loading preferences:', error);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      // Delete existing preferences
      await supabase
        .from('topic_event_preferences')
        .delete()
        .eq('topic_id', topicId);

      // Insert new preferences
      const { error } = await supabase
        .from('topic_event_preferences')
        .insert(
          preferences.map(pref => ({
            topic_id: topicId,
            event_type: pref.event_type,
            is_enabled: pref.is_enabled
          }))
        );

      if (error) throw error;

      toast({
        title: "Preferences Saved",
        description: "Event type preferences updated successfully"
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: "Error",
        description: "Failed to save preferences",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const generateEvents = async () => {
    setGenerating(true);
    setGenerationProgress(0);
    
    try {
      // Get enabled event types
      const enabledTypes = preferences
        .filter(pref => pref.is_enabled)
        .map(pref => pref.event_type);

      if (enabledTypes.length === 0) {
        toast({
          title: "No Event Types Selected",
          description: "Please select at least one event type to generate events",
          variant: "destructive"
        });
        return;
      }

      // Get topic details
      const { data: topicData, error: topicError } = await supabase
        .from('topics')
        .select('*')
        .eq('id', topicId)
        .single();

      if (topicError) throw topicError;

      setGenerationProgress(25);

      // Call AI event generator
      const { data, error } = await supabase.functions.invoke('ai-event-generator', {
        body: {
          topicId: topicId,
          eventTypes: enabledTypes,
          region: topicData.region || topicName
        }
      });

      setGenerationProgress(75);

      if (error) throw error;

      setGenerationProgress(100);
      
      toast({
        title: "Events Generated Successfully!",
        description: `Generated ${data.events_generated || 'several'} new events`
      });

      // Reload events to show new ones
      await loadEvents();
      
    } catch (error) {
      console.error('Error generating events:', error);
      toast({
        title: "Generation Failed",
        description: error.message || "Failed to generate events",
        variant: "destructive"
      });
    } finally {
      setGenerating(false);
      setGenerationProgress(0);
    }
  };

  const validateAllLinks = async () => {
    setValidating(true);
    setValidationProgress(0);
    
    try {
      const { data, error } = await supabase.functions.invoke('source-link-validator', {
        body: {
          action: 'validate_topic',
          topicId: topicId
        }
      });

      if (error) throw error;

      setValidationProgress(100);
      
      toast({
        title: "Validation Complete",
        description: `Checked ${data.summary.total} links. ${data.summary.valid} valid, ${data.summary.broken} broken.`
      });

      // Reload events to show validation status
      await loadEvents();
      
    } catch (error) {
      console.error('Error validating links:', error);
      toast({
        title: "Validation Failed",
        description: "Failed to validate source links",
        variant: "destructive"
      });
    } finally {
      setValidating(false);
      setValidationProgress(0);
    }
  };

  const deleteEvent = async (eventId: string) => {
    setDeletingEvents(prev => new Set([...prev, eventId]));
    
    try {
      const { data, error } = await supabase.rpc('delete_event_with_backfill', {
        event_id_param: eventId
      });

      if (error) throw error;

      toast({
        title: "Event Deleted",
        description: data?.[0]?.message || "Event deleted successfully"
      });

      await loadEvents();
    } catch (error) {
      console.error('Error deleting event:', error);
      toast({
        title: "Error",
        description: "Failed to delete event",
        variant: "destructive"
      });
    } finally {
      setDeletingEvents(prev => {
        const newSet = new Set(prev);
        newSet.delete(eventId);
        return newSet;
      });
    }
  };

  const togglePreference = (eventType: string) => {
    setPreferences(prev =>
      prev.map(pref =>
        pref.event_type === eventType
          ? { ...pref, is_enabled: !pref.is_enabled }
          : pref
      )
    );
  };

  const getEventTypeColor = (eventType: string) => {
    const colors = {
      'music': 'bg-purple-100 text-purple-800 border-purple-200',
      'comedy': 'bg-yellow-100 text-yellow-800 border-yellow-200',
      'shows': 'bg-blue-100 text-blue-800 border-blue-200',
      'musicals': 'bg-pink-100 text-pink-800 border-pink-200',
      'events': 'bg-green-100 text-green-800 border-green-200',
      'art_exhibitions': 'bg-orange-100 text-orange-800 border-orange-200'
    };
    return colors[eventType as keyof typeof colors] || 'bg-gray-100 text-gray-800 border-gray-200';
  };

  const getValidationIcon = (status?: string) => {
    switch (status) {
      case 'valid':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'broken':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      case 'timeout':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      default:
        return <Globe className="h-4 w-4 text-gray-400" />;
    }
  };

  // Separate events into Editor's Pick (top 5) and Reserve Pool (6+)
  const editorsPick = events.filter(e => e.rank_position <= 5);
  const reservePool = events.filter(e => e.rank_position > 5);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            AI Event Collection for {topicName}
          </CardTitle>
          <CardDescription>
            Smart event curation with source validation and category management
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="generate" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="generate">Generate</TabsTrigger>
              <TabsTrigger value="manage">Manage Events</TabsTrigger>
              <TabsTrigger value="validation">Validation</TabsTrigger>
            </TabsList>

            {/* Generate Tab */}
            <TabsContent value="generate" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Event Categories</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {EVENT_TYPES.map((type) => {
                      const pref = preferences.find(p => p.event_type === type.value);
                      const isEnabled = pref?.is_enabled ?? true;
                      
                      return (
                        <div
                          key={type.value}
                          className={`p-3 border rounded-lg cursor-pointer transition-all ${
                            isEnabled 
                              ? 'border-primary bg-primary/5 text-primary' 
                              : 'border-muted bg-muted/30 text-muted-foreground'
                          }`}
                          onClick={() => togglePreference(type.value)}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{type.label}</span>
                            <div className={`w-4 h-4 rounded border-2 transition-all ${
                              isEnabled 
                                ? 'bg-primary border-primary' 
                                : 'border-muted-foreground'
                            }`}>
                              {isEnabled && <CheckCircle className="w-full h-full text-white" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {generating && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Generating events...</span>
                    </div>
                    <Progress value={generationProgress} className="h-2" />
                  </div>
                )}

                <div className="flex gap-2">
                  <Button 
                    onClick={savePreferences}
                    disabled={saving}
                    variant="outline"
                  >
                    {saving ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Settings className="h-4 w-4 mr-2" />}
                    Save Preferences
                  </Button>
                  <Button 
                    onClick={generateEvents}
                    disabled={generating || preferences.filter(p => p.is_enabled).length === 0}
                  >
                    {generating ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <Zap className="h-4 w-4 mr-2" />}
                    Generate Events
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
                  <strong>How it works:</strong> AI curates 15 events (5 "Editor's Pick" + 10 reserve pool). 
                  Mix of popular venues and hidden gems. Source links validated automatically.
                </div>
              </div>
            </TabsContent>

            {/* Manage Events Tab */}
            <TabsContent value="manage" className="space-y-4">
              <div className="space-y-6">
                {/* Editor's Pick Section */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="h-5 w-5 text-primary" />
                    <h3 className="text-lg font-semibold">Editor's Pick (Top 5)</h3>
                    <Badge variant="default">Live in Feed</Badge>
                  </div>
                  <div className="space-y-2">
                    {editorsPick.length === 0 ? (
                      <p className="text-muted-foreground text-sm">No featured events. Generate some events to get started.</p>
                    ) : (
                      editorsPick.map((event, index) => (
                        <Card key={event.id} className="p-4">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-2">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">#{event.rank_position}</Badge>
                                <span className="font-medium text-sm">{event.title}</span>
                                <Badge className={`text-xs ${getEventTypeColor(event.event_type)}`}>
                                  {event.event_type.replace('_', ' ')}
                                </Badge>
                                {event.category === 'hidden_gem' && (
                                  <Badge variant="outline" className="text-xs">Hidden Gem</Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>{format(new Date(event.start_date), "MMM d")}</span>
                                {event.price && <span>{event.price}</span>}
                                {event.location && <span>{event.location}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {getValidationIcon(event.validation_status)}
                              {event.source_url && (
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 p-0">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteEvent(event.id)}
                                disabled={deletingEvents.has(event.id)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                {deletingEvents.has(event.id) ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))
                    )}
                  </div>
                </div>

                {/* Reserve Pool Section */}
                {reservePool.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <RefreshCw className="h-5 w-5 text-muted-foreground" />
                      <h3 className="text-lg font-semibold">Reserve Pool ({reservePool.length})</h3>
                      <Badge variant="outline">Rotation Ready</Badge>
                    </div>
                    <div className="space-y-2 max-h-80 overflow-y-auto">
                      {reservePool.map((event) => (
                        <Card key={event.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1 space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-xs">#{event.rank_position}</Badge>
                                <span className="font-medium text-sm">{event.title}</span>
                                <Badge className={`text-xs ${getEventTypeColor(event.event_type)}`}>
                                  {event.event_type.replace('_', ' ')}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span>{format(new Date(event.start_date), "MMM d")}</span>
                                {event.price && <span>{event.price}</span>}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {getValidationIcon(event.validation_status)}
                              {event.source_url && (
                                <Button variant="ghost" size="sm" asChild>
                                  <a href={event.source_url} target="_blank" rel="noopener noreferrer" className="h-8 w-8 p-0">
                                    <ExternalLink className="h-3 w-3" />
                                  </a>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => deleteEvent(event.id)}
                                disabled={deletingEvents.has(event.id)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                {deletingEvents.has(event.id) ? (
                                  <RefreshCw className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trash2 className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Validation Tab */}
            <TabsContent value="validation" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold mb-3">Source Link Validation</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    Check all event source links to ensure they're still valid and accessible.
                  </p>
                </div>

                {validating && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span className="text-sm">Validating source links...</span>
                    </div>
                    <Progress value={validationProgress} className="h-2" />
                  </div>
                )}

                <Button 
                  onClick={validateAllLinks}
                  disabled={validating || events.length === 0}
                >
                  {validating ? <RefreshCw className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  Validate All Links ({events.length})
                </Button>

                {/* Validation Status Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { status: 'valid', label: 'Valid', icon: CheckCircle, color: 'text-green-600' },
                    { status: 'broken', label: 'Broken', icon: AlertCircle, color: 'text-red-600' },
                    { status: 'timeout', label: 'Timeout', icon: Clock, color: 'text-yellow-600' },
                    { status: null, label: 'Unchecked', icon: Globe, color: 'text-gray-400' }
                  ].map(({ status, label, icon: Icon, color }) => {
                    const count = events.filter(e => e.validation_status === status).length;
                    return (
                      <div key={label} className="p-3 border rounded-lg text-center">
                        <Icon className={`h-6 w-6 mx-auto mb-2 ${color}`} />
                        <div className="text-2xl font-bold">{count}</div>
                        <div className="text-sm text-muted-foreground">{label}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};