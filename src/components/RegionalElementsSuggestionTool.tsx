import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, MapPin, Navigation, Building, Search, History, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useSuggestionMemory } from '@/hooks/useSuggestionMemory';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface RegionalElementSuggestion {
  element: string;
  type: 'landmark' | 'postcode' | 'organization';
  confidence_score: number;
  rationale: string;
}

interface RegionalElementSuggestionMemory {
  id: string;
  timestamp: number;
  confidence_score: number;
  shown: boolean;
  added: boolean;
  rejected: boolean;
  element: string;
  type: 'landmark' | 'postcode' | 'organization';
  rationale: string;
}

interface RegionalElementsSuggestionToolProps {
  topicName: string;
  region: string;
  description?: string;
  keywords?: string[];
  elementType: 'landmarks' | 'postcodes' | 'organizations';
  existingElements: string[];
  onElementAdd: (element: string) => void;
  existingLandmarks?: string[];
  existingPostcodes?: string[];
  existingOrganizations?: string[];
}

const getElementIcon = (type: string) => {
  switch (type) {
    case 'landmarks': return MapPin;
    case 'postcodes': return Navigation;
    case 'organizations': return Building;
    default: return MapPin;
  }
};

const getElementTypeLabel = (type: string) => {
  switch (type) {
    case 'landmarks': return 'Landmarks & Places';
    case 'postcodes': return 'Postcodes';
    case 'organizations': return 'Organizations';
    default: return type;
  }
};

export function RegionalElementsSuggestionTool({
  topicName,
  region,
  description,
  keywords = [],
  elementType,
  existingElements,
  onElementAdd,
  existingLandmarks = [],
  existingPostcodes = [],
  existingOrganizations = []
}: RegionalElementsSuggestionToolProps) {
  const [suggestions, setSuggestions] = useState<RegionalElementSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingElement, setAddingElement] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  
  const memoryKey = `regional-${elementType}-${topicName}-${region}`;
  const suggestionMemory = useSuggestionMemory<RegionalElementSuggestionMemory>(memoryKey);
  const stats = suggestionMemory.getStats();

  const getSuggestions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('suggest-regional-elements', {
        body: {
          topicName,
          region,
          description,
          keywords,
          elementType,
          existingLandmarks,
          existingPostcodes,
          existingOrganizations
        }
      });

      if (error) {
        throw error;
      }

      if (data.success) {
        const allSuggestions = data.suggestions.filter((s: RegionalElementSuggestion) => s.type === elementType.slice(0, -1));
        const newSuggestions = suggestionMemory.filterNewSuggestions(allSuggestions) as RegionalElementSuggestion[];
        
        setSuggestions(newSuggestions);
        
        // Add to memory
        const memoryItems = allSuggestions.map((s: RegionalElementSuggestion) => ({
          element: s.element,
          type: s.type,
          confidence_score: s.confidence_score,
          rationale: s.rationale
        }));
        suggestionMemory.addSuggestions(memoryItems);
        
        if (newSuggestions.length > 0) {
          toast.success(`Found ${newSuggestions.length} new ${getElementTypeLabel(elementType).toLowerCase()}${allSuggestions.length > newSuggestions.length ? ` (${allSuggestions.length - newSuggestions.length} already seen)` : ''}`);
        } else if (allSuggestions.length > 0) {
          toast.info(`All ${allSuggestions.length} suggested ${getElementTypeLabel(elementType).toLowerCase()} were previously shown. Check history to see them again.`);
        } else {
          toast.info(`No new ${getElementTypeLabel(elementType).toLowerCase()} found for this region`);
        }
      } else {
        throw new Error(data.error || `Failed to find ${getElementTypeLabel(elementType).toLowerCase()}`);
      }
    } catch (error) {
      console.error(`Error finding ${elementType}:`, error);
      toast.error(`Having trouble connecting to regional suggestion service. Please try again.`);
    } finally {
      setLoading(false);
    }
  };

  const addElement = async (element: string) => {
    // Check if element already exists (case insensitive)
    const normalizedElement = element.toLowerCase().trim();
    const normalizedExisting = existingElements.map(e => e.toLowerCase().trim());
    
    if (normalizedExisting.includes(normalizedElement)) {
      toast.info(`This ${elementType.slice(0, -1)} is already added`);
      return;
    }

    setAddingElement(element);
    try {
      // Trigger element addition
      onElementAdd(element);
      toast.success(`✅ Added ${elementType.slice(0, -1)}: "${element}"`);
      
      // Mark as added in memory
      const memoryItem = suggestionMemory.memory.find(item => item.element === element);
      if (memoryItem) {
        suggestionMemory.markAsAdded(memoryItem.id);
      }
      
      // Remove the added suggestion from the list
      setSuggestions(prev => prev.filter(s => s.element !== element));
    } catch (error) {
      console.error(`Error adding ${elementType.slice(0, -1)}:`, error);
      toast.error(`Failed to add ${elementType.slice(0, -1)}`);
    } finally {
      setAddingElement(null);
    }
  };

  const IconComponent = getElementIcon(elementType);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <IconComponent className="h-4 w-4" />
            Discover {getElementTypeLabel(elementType)}
          </h4>
          {stats.total > 0 && (
            <p className="text-xs text-muted-foreground">
              {stats.added} added, {stats.pending} pending, {stats.total} total discovered
            </p>
          )}
        </div>
        <div className="flex gap-2">
          {stats.total > 0 && (
            <Button
              onClick={() => setShowHistory(!showHistory)}
              variant="ghost"
              size="sm"
            >
              <History className="mr-2 h-4 w-4" />
              History ({stats.total})
            </Button>
          )}
          <Button 
            onClick={getSuggestions} 
            disabled={loading}
            variant="outline"
            size="sm"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Discovering...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Discover
              </>
            )}
          </Button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <div className="space-y-2">
          <div className="grid gap-2">
            {suggestions.map((suggestion, index) => (
              <div
                key={index}
                className="relative group rounded-lg border bg-card hover:bg-accent/50 transition-colors overflow-hidden"
              >
                <div 
                  className="flex flex-col sm:flex-row sm:items-start gap-2 p-3 pr-12 cursor-pointer"
                  onClick={() => addElement(suggestion.element)}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-sm text-foreground break-words">
                        {suggestion.element}
                      </span>
                      <Badge 
                        variant="secondary" 
                        className="text-xs shrink-0"
                      >
                        {Math.round(suggestion.confidence_score * 100)}%
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed break-words">
                      {suggestion.rationale}
                    </p>
                  </div>
                </div>
                
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    addElement(suggestion.element);
                  }}
                  disabled={addingElement === suggestion.element}
                  size="sm"
                  variant="ghost"
                  className="absolute top-3 right-3 h-8 w-8 p-0 shrink-0 hover:bg-primary hover:text-primary-foreground group-hover:bg-primary/10"
                >
                  {addingElement === suggestion.element ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats.total > 0 && (
        <Collapsible open={showHistory} onOpenChange={setShowHistory}>
          <CollapsibleContent className="space-y-2">
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Previously Discovered {getElementTypeLabel(elementType)}</span>
              </div>
              <div className="grid gap-2 max-h-60 overflow-y-auto">
                {suggestionMemory.getPreviouslySeen().map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between p-2 rounded border text-xs ${
                      item.added ? 'bg-green-50 border-green-200 dark:bg-green-950/20' :
                      item.rejected ? 'bg-red-50 border-red-200 dark:bg-red-950/20' :
                      'bg-background border-border'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.element}</span>
                        <Badge variant="secondary" className="text-xs">
                          {Math.round(item.confidence_score * 100)}%
                        </Badge>
                        {item.added && <Badge variant="default" className="text-xs bg-green-100 text-green-800">Added</Badge>}
                        {item.rejected && <Badge variant="destructive" className="text-xs">Rejected</Badge>}
                      </div>
                      <p className="text-muted-foreground truncate mt-1">{item.rationale}</p>
                    </div>
                    {!item.added && !item.rejected && (
                      <Button
                        onClick={() => {
                          // Re-add to current suggestions if not already there
                          if (!suggestions.some(s => s.element === item.element)) {
                            setSuggestions(prev => [...prev, {
                              element: item.element,
                              type: item.type,
                              confidence_score: item.confidence_score,
                              rationale: item.rationale
                            }]);
                          }
                        }}
                        size="sm"
                        variant="ghost"
                        className="h-6 w-6 p-0"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}