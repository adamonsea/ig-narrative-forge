import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Calendar, RefreshCw, Settings } from 'lucide-react';

interface EventPreference {
  event_type: string;
  is_enabled: boolean;
}

interface EventsManagerProps {
  topicId: string;
}

const EVENT_TYPES = [
  { value: 'music', label: 'Music & Concerts' },
  { value: 'comedy', label: 'Comedy Shows' },
  { value: 'shows', label: 'Theater & Shows' },
  { value: 'musicals', label: 'Musicals' },
  { value: 'events', label: 'Special Events' },
  { value: 'art_exhibitions', label: 'Art Exhibitions' }
];

export const EventsManager: React.FC<EventsManagerProps> = ({ topicId }) => {
  const [preferences, setPreferences] = useState<EventPreference[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadPreferences();
  }, [topicId]);

  const loadPreferences = async () => {
    try {
      const { data, error } = await supabase
        .from('topic_event_preferences')
        .select('*')
        .eq('topic_id', topicId);

      if (error && error.code !== 'PGRST116') { // Ignore "no rows" error
        throw error;
      }

      // Initialize with all event types if no preferences exist
      const existingPrefs = data || [];
      const allPrefs = EVENT_TYPES.map(eventType => {
        const existing = existingPrefs.find(p => p.event_type === eventType.value);
        return {
          event_type: eventType.value,
          is_enabled: existing ? existing.is_enabled : true
        };
      });

      setPreferences(allPrefs);
    } catch (error) {
      console.error('Error loading event preferences:', error);
      toast({
        title: 'Error',
        description: 'Failed to load event preferences',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const savePreferences = async () => {
    setSaving(true);
    try {
      // Delete existing preferences
      const { error: deleteError } = await supabase
        .from('topic_event_preferences')
        .delete()
        .eq('topic_id', topicId);

      if (deleteError) throw deleteError;

      // Insert new preferences
      const prefsToInsert = preferences.map(pref => ({
        topic_id: topicId,
        event_type: pref.event_type,
        is_enabled: pref.is_enabled
      }));

      const { error: insertError } = await supabase
        .from('topic_event_preferences')
        .insert(prefsToInsert);

      if (insertError) throw insertError;

      toast({
        title: 'Preferences Saved',
        description: 'Event type preferences have been updated',
      });
    } catch (error) {
      console.error('Error saving preferences:', error);
      toast({
        title: 'Error',
        description: 'Failed to save preferences',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const generateEvents = async () => {
    const enabledTypes = preferences
      .filter(p => p.is_enabled)
      .map(p => p.event_type);

    if (enabledTypes.length === 0) {
      toast({
        title: 'No Event Types Selected',
        description: 'Please select at least one event type to generate events',
        variant: 'destructive',
      });
      return;
    }

    setGenerating(true);
    try {
      // Get topic details for region context
      const { data: topic } = await supabase
        .from('topics')
        .select('region, name')
        .eq('id', topicId)
        .single();

      const response = await supabase.functions.invoke('ai-event-generator', {
        body: {
          topicId,
          eventTypes: enabledTypes,
          region: topic?.region || topic?.name
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate events');
      }

      const result = response.data;
      if (!result.success) {
        throw new Error(result.error || 'Event generation failed');
      }

      toast({
        title: 'Events Generated',
        description: result.message,
      });

    } catch (error) {
      console.error('Error generating events:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate events. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  const togglePreference = (eventType: string) => {
    setPreferences(prev => 
      prev.map(p => 
        p.event_type === eventType 
          ? { ...p, is_enabled: !p.is_enabled }
          : p
      )
    );
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Event Management
        </CardTitle>
        <CardDescription>
          Configure event types and generate weekly event listings
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Event Type Preferences */}
        <div>
          <h3 className="font-medium mb-3">Event Types to Include</h3>
          <div className="grid grid-cols-2 gap-3">
            {EVENT_TYPES.map(eventType => {
              const pref = preferences.find(p => p.event_type === eventType.value);
              return (
                <div key={eventType.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={eventType.value}
                    checked={pref?.is_enabled || false}
                    onCheckedChange={() => togglePreference(eventType.value)}
                  />
                  <label
                    htmlFor={eventType.value}
                    className="text-sm font-medium leading-none"
                  >
                    {eventType.label}
                  </label>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4 border-t">
          <Button 
            onClick={savePreferences}
            disabled={saving}
            variant="outline"
          >
            {saving ? 'Saving...' : 'Save Preferences'}
          </Button>
          <Button 
            onClick={generateEvents}
            disabled={generating}
            className="flex items-center gap-2"
          >
            {generating ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Calendar className="w-4 h-4" />
            )}
            {generating ? 'Generating...' : 'Generate Events'}
          </Button>
        </div>

        {/* Info */}
        <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
          <p>
            <strong>How it works:</strong> AI will generate a curated list of interesting events 
            happening in your area based on your selected event types. The top 5 events will be 
            displayed in your feed, with additional events available as backups.
          </p>
        </div>
      </CardContent>
    </Card>
  );
};