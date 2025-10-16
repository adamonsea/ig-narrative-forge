import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Plus, Star, Trash2, Users, Loader2 } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface TrackedMP {
  id: string;
  mp_id: number;
  mp_name: string;
  mp_party: string;
  constituency: string;
  is_primary: boolean;
  is_auto_detected: boolean;
  tracking_enabled: boolean;
}

interface MPOption {
  id: number;
  name: string;
  party: string;
  constituency: string;
}

interface TrackedMPsManagerProps {
  topicId: string;
  region?: string;
}

export const TrackedMPsManager = ({ topicId, region }: TrackedMPsManagerProps) => {
  const [trackedMPs, setTrackedMPs] = useState<TrackedMP[]>([]);
  const [allMPs, setAllMPs] = useState<MPOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMPs, setLoadingMPs] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [selectedMpId, setSelectedMpId] = useState<string>('');
  const { toast } = useToast();

  const loadTrackedMPs = async () => {
    try {
      const { data, error } = await supabase
        .from('topic_tracked_mps')
        .select('*')
        .eq('topic_id', topicId)
        .order('is_primary', { ascending: false })
        .order('mp_name', { ascending: true });

      if (error) throw error;
      setTrackedMPs(data || []);
    } catch (error: any) {
      console.error('Error loading tracked MPs:', error);
      toast({
        title: "Error",
        description: "Failed to load tracked MPs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadAllMPs = async () => {
    setLoadingMPs(true);
    try {
      const { data, error } = await supabase.functions.invoke('fetch-current-mps', {
        body: {}
      });

      if (error) throw error;
      setAllMPs(data.mps || []);
    } catch (error: any) {
      console.error('Error loading MPs:', error);
      toast({
        title: "Error",
        description: "Failed to load MP list",
        variant: "destructive"
      });
    } finally {
      setLoadingMPs(false);
    }
  };

  useEffect(() => {
    loadTrackedMPs();
  }, [topicId]);

  const handleToggle = async (mpId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('topic_tracked_mps')
        .update({ tracking_enabled: !currentStatus })
        .eq('id', mpId);

      if (error) throw error;

      setTrackedMPs(prev =>
        prev.map(mp =>
          mp.id === mpId ? { ...mp, tracking_enabled: !currentStatus } : mp
        )
      );

      toast({
        title: "Success",
        description: `MP tracking ${!currentStatus ? 'enabled' : 'disabled'}`,
      });
    } catch (error: any) {
      console.error('Error toggling MP:', error);
      toast({
        title: "Error",
        description: "Failed to update MP tracking",
        variant: "destructive"
      });
    }
  };

  const handleSetPrimary = async (mpId: string) => {
    try {
      // Remove primary from all MPs
      await supabase
        .from('topic_tracked_mps')
        .update({ is_primary: false })
        .eq('topic_id', topicId);

      // Set new primary
      const { error } = await supabase
        .from('topic_tracked_mps')
        .update({ is_primary: true })
        .eq('id', mpId);

      if (error) throw error;

      setTrackedMPs(prev =>
        prev.map(mp => ({ ...mp, is_primary: mp.id === mpId }))
      );

      toast({
        title: "Success",
        description: "Primary MP updated",
      });
    } catch (error: any) {
      console.error('Error setting primary:', error);
      toast({
        title: "Error",
        description: "Failed to set primary MP",
        variant: "destructive"
      });
    }
  };

  const handleAddMP = async () => {
    if (!selectedMpId) return;

    const mpToAdd = allMPs.find(mp => mp.id.toString() === selectedMpId);
    if (!mpToAdd) return;

    try {
      const { error } = await supabase
        .from('topic_tracked_mps')
        .insert({
          topic_id: topicId,
          mp_id: mpToAdd.id,
          mp_name: mpToAdd.name,
          mp_party: mpToAdd.party,
          constituency: mpToAdd.constituency,
          is_auto_detected: false,
          is_primary: trackedMPs.length === 0,
          tracking_enabled: true
        });

      if (error) throw error;

      await loadTrackedMPs();
      setShowSearch(false);
      setSelectedMpId('');

      toast({
        title: "Success",
        description: `Added ${mpToAdd.name} to tracked MPs`,
      });
    } catch (error: any) {
      console.error('Error adding MP:', error);
      toast({
        title: "Error",
        description: error.message.includes('duplicate') 
          ? "This MP is already tracked" 
          : "Failed to add MP",
        variant: "destructive"
      });
    }
  };

  const handleRemove = async (mpId: string) => {
    try {
      const { error } = await supabase
        .from('topic_tracked_mps')
        .delete()
        .eq('id', mpId);

      if (error) throw error;

      setTrackedMPs(prev => prev.filter(mp => mp.id !== mpId));

      toast({
        title: "Success",
        description: "MP removed from tracking",
      });
    } catch (error: any) {
      console.error('Error removing MP:', error);
      toast({
        title: "Error",
        description: "Failed to remove MP",
        variant: "destructive"
      });
    }
  };

  const autoDetectedMPs = trackedMPs.filter(mp => mp.is_auto_detected);
  const manualMPs = trackedMPs.filter(mp => !mp.is_auto_detected);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Tracked MPs
        </CardTitle>
        <CardDescription>
          {trackedMPs.length > 0 
            ? `Tracking ${trackedMPs.length} MP${trackedMPs.length > 1 ? 's' : ''} ${region ? `for ${region}` : ''}`
            : 'No MPs tracked yet'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Auto-detected MPs */}
        {autoDetectedMPs.length > 0 && (
          <div className="space-y-3">
            <Label>Regional MPs</Label>
            {autoDetectedMPs.map(mp => (
              <div key={mp.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{mp.mp_name}</span>
                    {mp.is_primary && (
                      <Badge variant="default" className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Primary
                      </Badge>
                    )}
                    <Badge variant="secondary">{mp.mp_party}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{mp.constituency}</p>
                </div>
                <div className="flex items-center gap-3">
                  {!mp.is_primary && trackedMPs.length > 1 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetPrimary(mp.id)}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Switch
                    checked={mp.tracking_enabled}
                    onCheckedChange={() => handleToggle(mp.id, mp.tracking_enabled)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(mp.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Manually added MPs */}
        {manualMPs.length > 0 && (
          <div className="space-y-3">
            <Label>Additional MPs</Label>
            {manualMPs.map(mp => (
              <div key={mp.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{mp.mp_name}</span>
                    {mp.is_primary && (
                      <Badge variant="default" className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        Primary
                      </Badge>
                    )}
                    <Badge variant="outline">{mp.mp_party}</Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{mp.constituency}</p>
                </div>
                <div className="flex items-center gap-3">
                  {!mp.is_primary && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSetPrimary(mp.id)}
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Switch
                    checked={mp.tracking_enabled}
                    onCheckedChange={() => handleToggle(mp.id, mp.tracking_enabled)}
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemove(mp.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add MP section */}
        {!showSearch ? (
          <Button 
            onClick={() => {
              setShowSearch(true);
              loadAllMPs();
            }}
            variant="outline"
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Track Additional MP
          </Button>
        ) : (
          <div className="space-y-3 p-4 border rounded-lg bg-muted/30">
            <Label>Search for MP</Label>
            <Select value={selectedMpId} onValueChange={setSelectedMpId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingMPs ? "Loading..." : "Select an MP..."} />
              </SelectTrigger>
              <SelectContent>
                {allMPs
                  .filter(mp => !trackedMPs.some(t => t.mp_id === mp.id))
                  .map(mp => (
                    <SelectItem key={mp.id} value={mp.id.toString()}>
                      {mp.name} ({mp.party}) - {mp.constituency}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button 
                onClick={handleAddMP}
                disabled={!selectedMpId}
                className="flex-1"
              >
                Add MP
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  setShowSearch(false);
                  setSelectedMpId('');
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
