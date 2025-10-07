import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Settings, HelpCircle, Users, Bot, Clock, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { TopicBrandingSettings } from "@/components/TopicBrandingSettings";
import { ParliamentaryAutomationSettings } from "@/components/ParliamentaryAutomationSettings";

interface TopicSettingsProps {
  topicId: string;
  currentExpertise?: 'beginner' | 'intermediate' | 'expert';
  currentTone?: 'formal' | 'conversational' | 'engaging';
  currentWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  currentCommunityEnabled?: boolean;
  currentAutoSimplifyEnabled?: boolean;
  currentAutomationQualityThreshold?: number;
  currentParliamentaryTrackingEnabled?: boolean;
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
  currentAutoSimplifyEnabled,
  currentAutomationQualityThreshold,
  currentParliamentaryTrackingEnabled,
  topicType,
  region,
  onUpdate 
}: TopicSettingsProps) => {
  const [expertise, setExpertise] = useState<'beginner' | 'intermediate' | 'expert'>(currentExpertise || 'intermediate');
  const [tone, setTone] = useState<'formal' | 'conversational' | 'engaging'>(currentTone || 'conversational');
  const [writingStyle, setWritingStyle] = useState<'journalistic' | 'educational' | 'listicle' | 'story_driven'>(currentWritingStyle || 'journalistic');
  const [communityEnabled, setCommunityEnabled] = useState<boolean>(currentCommunityEnabled || false);
  const [autoSimplifyEnabled, setAutoSimplifyEnabled] = useState<boolean>(currentAutoSimplifyEnabled === true);
  const [automationQualityThreshold, setAutomationQualityThreshold] = useState<number>(currentAutomationQualityThreshold || 60);
  // Parliamentary tracking only available for regional topics
  const [parliamentaryTrackingEnabled, setParliamentaryTrackingEnabled] = useState<boolean>(
    topicType === 'regional' ? (currentParliamentaryTrackingEnabled || false) : false
  );
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const { isSuperAdmin, user } = useAuth();
  
  // Check if user has automation access
  const hasAutomationAccess = user?.email === 'adamonsea@gmail.com';

  useEffect(() => {
    if (currentExpertise) setExpertise(currentExpertise);
    if (currentTone) setTone(currentTone);
    if (currentWritingStyle) setWritingStyle(currentWritingStyle);
    if (currentCommunityEnabled !== undefined) setCommunityEnabled(currentCommunityEnabled);
    if (currentAutoSimplifyEnabled !== undefined) setAutoSimplifyEnabled(currentAutoSimplifyEnabled);
    if (currentAutomationQualityThreshold !== undefined) setAutomationQualityThreshold(currentAutomationQualityThreshold);
    // Only allow parliamentary tracking for regional topics
    if (currentParliamentaryTrackingEnabled !== undefined && topicType === 'regional') {
      setParliamentaryTrackingEnabled(currentParliamentaryTrackingEnabled);
    }
  }, [currentExpertise, currentTone, currentWritingStyle, currentCommunityEnabled, currentAutoSimplifyEnabled, currentAutomationQualityThreshold, currentParliamentaryTrackingEnabled]);

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
          auto_simplify_enabled: autoSimplifyEnabled,
          automation_quality_threshold: automationQualityThreshold,
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
              onCheckedChange={setCommunityEnabled}
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
            {!hasAutomationAccess && (
              <Badge variant="outline" className="text-xs">Limited Access</Badge>
            )}
          </div>
          
          <div className={`space-y-4 p-4 border rounded-lg ${!hasAutomationAccess ? 'opacity-60' : ''}`}>
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
                          <p className="text-muted-foreground">Requires global automation to be enabled</p>
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
                disabled={!hasAutomationAccess}
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
                    disabled={!hasAutomationAccess}
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
              autoSimplifyEnabled === (currentAutoSimplifyEnabled === true) &&
              automationQualityThreshold === (currentAutomationQualityThreshold || 60) &&
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