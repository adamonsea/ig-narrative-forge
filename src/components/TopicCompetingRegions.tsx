import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, X, MapPin } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/components/ui/use-toast';

interface TopicCompetingRegionsProps {
  topicId: string;
  competingRegions: string[];
  onUpdate: (regions: string[]) => void;
}

export const TopicCompetingRegions: React.FC<TopicCompetingRegionsProps> = ({
  topicId,
  competingRegions,
  onUpdate
}) => {
  const [newRegion, setNewRegion] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const addRegion = async () => {
    if (!newRegion.trim()) return;

    const region = newRegion.trim().toLowerCase();
    if (competingRegions.includes(region)) {
      toast({
        title: "Region already exists",
        description: "This competing region is already in the list.",
        variant: "destructive",
      });
      return;
    }

    setIsAdding(true);
    const updatedRegions = [...competingRegions, region];

    try {
      const { error } = await supabase
        .from('topics')
        .update({ competing_regions: updatedRegions })
        .eq('id', topicId);

      if (error) throw error;

      onUpdate(updatedRegions);
      setNewRegion('');
      toast({
        title: "Competing region added",
        description: "Articles mentioning this region will receive lower relevance scores.",
      });
    } catch (error) {
      console.error('Error adding competing region:', error);
      toast({
        title: "Error",
        description: "Failed to add competing region.",
        variant: "destructive",
      });
    } finally {
      setIsAdding(false);
    }
  };

  const removeRegion = async (regionToRemove: string) => {
    const updatedRegions = competingRegions.filter(r => r !== regionToRemove);

    try {
      const { error } = await supabase
        .from('topics')
        .update({ competing_regions: updatedRegions })
        .eq('id', topicId);

      if (error) throw error;

      onUpdate(updatedRegions);
      toast({
        title: "Competing region removed",
        description: "This region will no longer affect relevance scoring.",
      });
    } catch (error) {
      console.error('Error removing competing region:', error);
      toast({
        title: "Error",
        description: "Failed to remove competing region.",
        variant: "destructive",
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="w-5 h-5 text-warning" />
          Competing Regions
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Articles mentioning these regions will receive lower relevance scores to prioritize local content.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Input
            placeholder="Enter competing region (e.g. Brighton, London)..."
            value={newRegion}
            onChange={(e) => setNewRegion(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && addRegion()}
          />
          <Button 
            onClick={addRegion} 
            disabled={!newRegion.trim() || isAdding}
            size="sm"
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {competingRegions.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Current competing regions:</p>
            <div className="flex flex-wrap gap-2">
              {competingRegions.map((region) => (
                <Badge 
                  key={region} 
                  variant="secondary" 
                  className="gap-1"
                >
                  {region}
                  <button
                    onClick={() => removeRegion(region)}
                    className="hover:bg-secondary-foreground/20 rounded-full p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
          </div>
        )}

        {competingRegions.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <MapPin className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No competing regions defined</p>
            <p className="text-xs">Add regions that compete with your local area for better content filtering</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};