import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Settings, HelpCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface TopicSettingsProps {
  topicId: string;
  currentExpertise?: 'beginner' | 'intermediate' | 'expert';
  currentTone?: 'formal' | 'conversational' | 'engaging';
  currentWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  onUpdate?: () => void;
}

export const TopicSettings = ({ topicId, currentExpertise, currentTone, currentWritingStyle, onUpdate }: TopicSettingsProps) => {
  const [expertise, setExpertise] = useState<'beginner' | 'intermediate' | 'expert'>(currentExpertise || 'intermediate');
  const [tone, setTone] = useState<'formal' | 'conversational' | 'engaging'>(currentTone || 'conversational');
  const [writingStyle, setWritingStyle] = useState<'journalistic' | 'educational' | 'listicle' | 'story_driven'>(currentWritingStyle || 'journalistic');
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (currentExpertise) setExpertise(currentExpertise);
    if (currentTone) setTone(currentTone);
    if (currentWritingStyle) setWritingStyle(currentWritingStyle);
  }, [currentExpertise, currentTone, currentWritingStyle]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          audience_expertise: expertise,
          default_tone: tone,
          default_writing_style: writingStyle,
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
              <span className="text-xs text-muted-foreground block">
                Controls complexity and depth of generated content
              </span>
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
              <span className="text-xs text-muted-foreground block">
                Can be overridden per individual article
              </span>
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
              <span className="text-xs text-muted-foreground block">
                Structural format for generated content
              </span>
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

        <div className="flex justify-end">
          <Button 
            onClick={handleSave} 
            disabled={saving || (expertise === currentExpertise && tone === currentTone && writingStyle === currentWritingStyle)}
          >
            {saving ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};