import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, HelpCircle, Users, Bot, Clock, Building2, Calendar, X, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TopicBrandingSettings } from "@/components/TopicBrandingSettings";
import { ParliamentaryAutomationSettings } from "@/components/ParliamentaryAutomationSettings";

interface TopicSettingsProps {
  topicId: string;
  currentExpertise?: 'beginner' | 'intermediate' | 'expert';
  currentTone?: 'formal' | 'conversational' | 'engaging';
  currentWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  currentCommunityEnabled?: boolean;
  currentCommunityPulseFrequency?: number;
  currentCommunityConfig?: {
    subreddits?: string[];
    last_processed?: string;
    processing_frequency_hours?: number;
  };
  currentAutoSimplifyEnabled?: boolean;
  currentAutomationQualityThreshold?: number;
  currentParliamentaryTrackingEnabled?: boolean;
  currentEventsEnabled?: boolean;
  topicType?: string;
  region?: string;
  onUpdate?: () => void;
}

export const TopicSettings = ({ 
  topicId, 
  currentExpertise, 
  currentTone, 
  currentWritingStyle, 
  currentCommunityEnabled,
  currentCommunityPulseFrequency,
  currentCommunityConfig,
  currentAutoSimplifyEnabled,
  currentAutomationQualityThreshold,
  currentParliamentaryTrackingEnabled,
  currentEventsEnabled,
  topicType,
  region,
  onUpdate 
}: TopicSettingsProps) => {
  const [expertise, setExpertise] = useState<'beginner' | 'intermediate' | 'expert'>(currentExpertise || 'intermediate');
  const [tone, setTone] = useState<'formal' | 'conversational' | 'engaging'>(currentTone || 'conversational');
  const [writingStyle, setWritingStyle] = useState<'journalistic' | 'educational' | 'listicle' | 'story_driven'>(currentWritingStyle || 'journalistic');
  const [communityEnabled, setCommunityEnabled] = useState<boolean>(currentCommunityEnabled || false);
  const [communityPulseFrequency, setCommunityPulseFrequency] = useState<number>(currentCommunityPulseFrequency || 8);
  const [subreddits, setSubreddits] = useState<string[]>(currentCommunityConfig?.subreddits || []);
  const [newSubreddit, setNewSubreddit] = useState<string>('');
  const [processingFrequency, setProcessingFrequency] = useState<number>(currentCommunityConfig?.processing_frequency_hours || 24);
  const [eventsEnabled, setEventsEnabled] = useState<boolean>(currentEventsEnabled || false);
  const [autoSimplifyEnabled, setAutoSimplifyEnabled] = useState<boolean>(currentAutoSimplifyEnabled === true);
  const [automationQualityThreshold, setAutomationQualityThreshold] = useState<number>(currentAutomationQualityThreshold || 60);
  // Parliamentary tracking only available for regional topics
  const [parliamentaryTrackingEnabled, setParliamentaryTrackingEnabled] = useState<boolean>(
    topicType === 'regional' ? (currentParliamentaryTrackingEnabled || false) : false
  );
  const [saving, setSaving] = useState(false);
  const [processingCommunity, setProcessingCommunity] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (currentExpertise) setExpertise(currentExpertise);
    if (currentTone) setTone(currentTone);
    if (currentWritingStyle) setWritingStyle(currentWritingStyle);
    if (currentCommunityEnabled !== undefined) setCommunityEnabled(currentCommunityEnabled);
    if (currentCommunityPulseFrequency !== undefined) setCommunityPulseFrequency(currentCommunityPulseFrequency);
    if (currentCommunityConfig?.subreddits) setSubreddits(currentCommunityConfig.subreddits);
    if (currentCommunityConfig?.processing_frequency_hours) setProcessingFrequency(currentCommunityConfig.processing_frequency_hours);
    if (currentAutoSimplifyEnabled !== undefined) setAutoSimplifyEnabled(currentAutoSimplifyEnabled);
    if (currentAutomationQualityThreshold !== undefined) setAutomationQualityThreshold(currentAutomationQualityThreshold);
    if (currentEventsEnabled !== undefined) setEventsEnabled(currentEventsEnabled);
    // Only allow parliamentary tracking for regional topics
    if (currentParliamentaryTrackingEnabled !== undefined && topicType === 'regional') {
      setParliamentaryTrackingEnabled(currentParliamentaryTrackingEnabled);
    }
  }, [currentExpertise, currentTone, currentWritingStyle, currentCommunityEnabled, currentCommunityPulseFrequency, currentCommunityConfig, currentAutoSimplifyEnabled, currentAutomationQualityThreshold, currentEventsEnabled, currentParliamentaryTrackingEnabled]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          audience_expertise: expertise,
          default_tone: tone,
          default_writing_style: writingStyle,
          community_intelligence_enabled: communityEnabled,
          community_pulse_frequency: communityPulseFrequency,
          community_config: {
            subreddits,
            processing_frequency_hours: processingFrequency,
            last_processed: currentCommunityConfig?.last_processed || null
          },
          auto_simplify_enabled: autoSimplifyEnabled,
          automation_quality_threshold: automationQualityThreshold,
          events_enabled: eventsEnabled,
          // Only save parliamentary tracking for regional topics
          parliamentary_tracking_enabled: topicType === 'regional' ? parliamentaryTrackingEnabled : false,
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;

      toast({
        title: "Settings Updated",
        description: "Topic settings have been saved successfully"
      });
      
      onUpdate?.();
    } catch (error) {
      console.error('Error updating topic settings:', error);
      toast({
        title: "Error",
        description: "Failed to update topic settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAddSubreddit = () => {
    const cleaned = newSubreddit.trim().toLowerCase().replace(/^r\//, '');
    if (cleaned && !subreddits.includes(cleaned)) {
      // List of generic national subreddits that should trigger a warning
      const nationalSubreddits = [
        'unitedkingdom', 'uk', 'ukpolitics', 'england', 'britishproblems', 
        'casualuk', 'scotland', 'wales', 'northernireland', 'london'
      ];
      
      const isNationalSubreddit = nationalSubreddits.includes(cleaned);
      
      if (isNationalSubreddit && topicType === 'regional') {
        toast({
          title: "⚠️ National Subreddit Detected",
          description: `r/${cleaned} is a national community. This may result in generic keywords instead of local ${region || 'regional'} insights. Consider using local subreddits instead.`,
          variant: "default",
        });
      }
      
      setSubreddits([...subreddits, cleaned]);
      setNewSubreddit('');
    }
  };

  const handleRemoveSubreddit = async (subreddit: string) => {
    const updatedSubreddits = subreddits.filter(s => s !== subreddit);
    setSubreddits(updatedSubreddits);
    
    // Auto-save immediately
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          community_config: {
            subreddits: updatedSubreddits,
            processing_frequency_hours: processingFrequency,
            last_processed: currentCommunityConfig?.last_processed || null
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;

      toast({
        title: "Subreddit Removed",
        description: `r/${subreddit} has been removed from monitoring`
      });
      
      onUpdate?.();
    } catch (error) {
      console.error('Error removing subreddit:', error);
      toast({
        title: "Error",
        description: "Failed to remove subreddit",
        variant: "destructive"
      });
      // Revert local state on error
      setSubreddits(subreddits);
    }
  };

  const handleProcessCommunity = async () => {
    setProcessingCommunity(true);
    try {
      // Call scheduler with manual trigger for THIS specific topic
      const { data, error } = await supabase.functions.invoke('reddit-community-scheduler', {
        body: { 
          manual_test: true, 
          force_topic_id: topicId 
        }
      });
      
      if (error) throw error;
      
      toast({
        title: "Community Analysis Triggered",
        description: `Processing Reddit insights specifically for this topic. Check back in a few minutes.`
      });
    } catch (error) {
      console.error('Error processing community insights:', error);
      toast({
        title: "Error",
        description: "Failed to start community processing",
        variant: "destructive"
      });
    } finally {
      setProcessingCommunity(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="w-5 h-5" />
          Content Generation Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-3">
            <Label htmlFor="expertise">
              Audience Expertise Level
            </Label>
            <Select value={expertise} onValueChange={(value: 'beginner' | 'intermediate' | 'expert') => setExpertise(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="beginner">
                  <div>
                    <div className="font-medium">Beginner</div>
                    <div className="text-xs text-muted-foreground">Clear explanations, more context</div>
                  </div>
                </SelectItem>
                <SelectItem value="intermediate">
                  <div>
                    <div className="font-medium">Intermediate</div>
                    <div className="text-xs text-muted-foreground">Balanced technical depth</div>
                  </div>
                </SelectItem>
                <SelectItem value="expert">
                  <div>
                    <div className="font-medium">Expert</div>
                    <div className="text-xs text-muted-foreground">Technical terminology, advanced insights</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label htmlFor="tone">
              Default Content Tone
            </Label>
            <Select value={tone} onValueChange={(value: 'formal' | 'conversational' | 'engaging') => setTone(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="formal">
                  <div>
                    <div className="font-medium">Formal</div>
                    <div className="text-xs text-muted-foreground">Professional, authoritative</div>
                  </div>
                </SelectItem>
                <SelectItem value="conversational">
                  <div>
                    <div className="font-medium">Conversational</div>
                    <div className="text-xs text-muted-foreground">Accessible, friendly</div>
                  </div>
                </SelectItem>
                <SelectItem value="engaging">
                  <div>
                    <div className="font-medium">Engaging</div>
                    <div className="text-xs text-muted-foreground">Dynamic, compelling</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <Label htmlFor="writingStyle" className="flex items-center gap-2">
              Default Writing Style
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    <div className="space-y-2 text-sm">
                      <p><strong>Journalistic:</strong> Traditional news format with lead paragraph and supporting facts</p>
                      <p><strong>Educational:</strong> Clear explanations with examples and key takeaways</p>
                      <p><strong>Listicle:</strong> Organized points with clear structure and numbered format</p>
                      <p><strong>Story-driven:</strong> Narrative approach with characters and resolution</p>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </Label>
            <Select value={writingStyle} onValueChange={(value: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => setWritingStyle(value)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="journalistic">
                  <div>
                    <div className="font-medium">Journalistic</div>
                    <div className="text-xs text-muted-foreground">Traditional news structure</div>
                  </div>
                </SelectItem>
                <SelectItem value="educational">
                  <div>
                    <div className="font-medium">Educational</div>
                    <div className="text-xs text-muted-foreground">Clear explanations with examples</div>
                  </div>
                </SelectItem>
                <SelectItem value="listicle">
                  <div>
                    <div className="font-medium">Listicle</div>
                    <div className="text-xs text-muted-foreground">Numbered points and structure</div>
                  </div>
                </SelectItem>
                <SelectItem value="story_driven">
                  <div>
                    <div className="font-medium">Story-driven</div>
                    <div className="text-xs text-muted-foreground">Narrative with characters</div>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Community Intelligence Toggle */}
        <div className="border-t pt-6">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Community Voice
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <div className="space-y-2 text-sm">
                        <p><strong>Community Voice:</strong> Analyzes relevant Reddit discussions to understand local sentiment and community concerns</p>
                        <p>Provides gentle background insights about what your community is discussing - processes slowly over hours/days</p>
                        <p className="text-muted-foreground">Premium feature</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </Label>
              <p className="text-sm text-muted-foreground">
                {communityEnabled ? "Gathering community insights in background" : "Add community discussions to enrich your feed"}
              </p>
            </div>
            <Switch
              checked={communityEnabled}
              onCheckedChange={async (checked) => {
                setCommunityEnabled(checked);
                
                // Auto-save immediately
                try {
                  const { error } = await supabase
                    .from('topics')
                    .update({
                      community_intelligence_enabled: checked,
                      updated_at: new Date().toISOString()
                    })
                    .eq('id', topicId);

                  if (error) throw error;

                  toast({
                    title: checked ? "Community Voice Enabled" : "Community Voice Disabled",
                    description: checked 
                      ? "Now monitoring community discussions" 
                      : "Stopped monitoring community discussions"
                  });
                  
                  onUpdate?.();
                } catch (error) {
                  console.error('Error toggling community intelligence:', error);
                  toast({
                    title: "Error",
                    description: "Failed to update setting",
                    variant: "destructive"
                  });
                  // Revert local state on error
                  setCommunityEnabled(!checked);
                }
              }}
            />
          </div>

          {communityEnabled && (
            <div className="mt-4 space-y-4 p-4 border rounded-lg bg-muted/20">
              <div className="space-y-3">
                <Label>Subreddits to Monitor</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="e.g. eastbourne or r/eastbourne"
                    value={newSubreddit}
                    onChange={(e) => setNewSubreddit(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSubreddit())}
                  />
                  <Button
                    onClick={handleAddSubreddit}
                    disabled={!newSubreddit.trim()}
                    size="icon"
                    variant="secondary"
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
                {subreddits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {subreddits.map((subreddit) => {
                      const nationalSubreddits = [
                        'unitedkingdom', 'uk', 'ukpolitics', 'england', 'britishproblems', 
                        'casualuk', 'scotland', 'wales', 'northernireland', 'london'
                      ];
                      const isNational = nationalSubreddits.includes(subreddit);
                      
                      return (
                        <Badge 
                          key={subreddit} 
                          variant={isNational && topicType === 'regional' ? "destructive" : "secondary"} 
                          className="gap-1"
                        >
                          {isNational && topicType === 'regional' && "⚠️ "}
                          r/{subreddit}
                          <button
                            onClick={() => handleRemoveSubreddit(subreddit)}
                            className="ml-1 hover:text-destructive"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Add subreddits to monitor for community insights. Daily automation will analyze these communities.
                  {topicType === 'regional' && (
                    <span className="block mt-1 text-amber-600 dark:text-amber-400">
                      ⚠️ National subreddits (like r/unitedkingdom) may generate generic keywords. Use local subreddits for better regional relevance.
                    </span>
                  )}
                </p>
              </div>

              <div className="space-y-3">
                <Label>Processing Frequency</Label>
                <Select 
                  value={processingFrequency.toString()} 
                  onValueChange={(value) => setProcessingFrequency(Number(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">Every 12 hours</SelectItem>
                    <SelectItem value="24">Every 24 hours</SelectItem>
                    <SelectItem value="48">Every 48 hours</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  How often the automated job checks for new Reddit insights
                </p>
              </div>

              <div className="space-y-3">
                <Label>
                  Community Pulse Frequency: Every {communityPulseFrequency} stories
                </Label>
                <Slider
                  value={[communityPulseFrequency]}
                  onValueChange={([value]) => setCommunityPulseFrequency(value)}
                  max={20}
                  min={4}
                  step={2}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  How often to show Community Pulse cards in your feed
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={handleProcessCommunity}
                  disabled={processingCommunity}
                  variant="outline"
                  size="sm"
                  className="w-fit"
                >
                  <Users className="w-4 h-4 mr-2" />
                  {processingCommunity ? 'Processing...' : 'Process Community Insights Now'}
                </Button>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="text-sm">Manually trigger Reddit community analysis. This will fetch and analyze recent discussions from configured subreddits.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Events Toggle */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <Label className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Show Events in Feed
              </Label>
              <p className="text-sm text-muted-foreground">
                Display curated local events between news stories in the feed
              </p>
            </div>
            <Switch
              checked={eventsEnabled}
              onCheckedChange={setEventsEnabled}
            />
          </div>
        </div>

        <Separator />

        {/* Parliamentary Tracking - Only show for regional topics */}
        {topicType === 'regional' && (
          <ParliamentaryAutomationSettings
            topicId={topicId}
            region={region}
            enabled={parliamentaryTrackingEnabled}
            onToggle={setParliamentaryTrackingEnabled}
          />
        )}

        <Separator />

        {/* Automation Settings */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4" />
            <Label className="text-base font-medium">Automation Settings</Label>
          </div>
          
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label className="flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Auto-Simplification
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <HelpCircle className="w-4 h-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="space-y-2 text-sm">
                          <p><strong>Auto-Simplification:</strong> Automatically processes new articles that meet quality thresholds</p>
                          <p>Articles are queued for story generation without manual approval</p>
                          <p className="text-muted-foreground">Configure automated gathering and simplification for this topic</p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </Label>
                <p className="text-sm text-muted-foreground">
                  {autoSimplifyEnabled ? "New articles will be automatically processed" : "Manual approval required for story generation"}
                </p>
              </div>
              <Switch
                checked={autoSimplifyEnabled}
                onCheckedChange={setAutoSimplifyEnabled}
              />
            </div>

            {autoSimplifyEnabled && (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>
                    Quality Threshold: {automationQualityThreshold}%
                  </Label>
                  <Slider
                    value={[automationQualityThreshold]}
                    onValueChange={([value]) => setAutomationQualityThreshold(value)}
                    max={100}
                    min={30}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Only articles with quality scores above this threshold will be automatically processed
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={saving || (
              expertise === currentExpertise && 
              tone === currentTone && 
              writingStyle === currentWritingStyle && 
              communityEnabled === currentCommunityEnabled &&
              communityPulseFrequency === (currentCommunityPulseFrequency || 8) &&
              autoSimplifyEnabled === (currentAutoSimplifyEnabled === true) &&
              automationQualityThreshold === (currentAutomationQualityThreshold || 60) &&
              eventsEnabled === (currentEventsEnabled === true) &&
              parliamentaryTrackingEnabled === (currentParliamentaryTrackingEnabled === true)
            )}
          >
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};