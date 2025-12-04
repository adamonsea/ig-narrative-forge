import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ILLUSTRATION_STYLES, ILLUSTRATION_STYLE_LABELS, ILLUSTRATION_STYLE_DESCRIPTIONS, type IllustrationStyle } from "@/lib/constants/illustrationStyles";

interface ContentVoiceSettingsProps {
  topicId: string;
  currentExpertise?: 'beginner' | 'intermediate' | 'expert';
  currentTone?: 'formal' | 'conversational' | 'engaging' | 'satirical';
  currentWritingStyle?: 'journalistic' | 'educational' | 'listicle' | 'story_driven';
  currentIllustrationStyle?: IllustrationStyle;
  onUpdate?: () => void;
}

export const ContentVoiceSettings = ({
  topicId,
  currentExpertise,
  currentTone,
  currentWritingStyle,
  currentIllustrationStyle,
  onUpdate
}: ContentVoiceSettingsProps) => {
  const [expertise, setExpertise] = useState<'beginner' | 'intermediate' | 'expert'>(currentExpertise || 'intermediate');
  const [tone, setTone] = useState<'formal' | 'conversational' | 'engaging' | 'satirical'>(currentTone || 'conversational');
  const [writingStyle, setWritingStyle] = useState<'journalistic' | 'educational' | 'listicle' | 'story_driven'>(currentWritingStyle || 'journalistic');
  const [illustrationStyle, setIllustrationStyle] = useState<IllustrationStyle>(currentIllustrationStyle || ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (currentExpertise) setExpertise(currentExpertise);
    if (currentTone) setTone(currentTone);
    if (currentWritingStyle) setWritingStyle(currentWritingStyle);
    if (currentIllustrationStyle) setIllustrationStyle(currentIllustrationStyle);
  }, [currentExpertise, currentTone, currentWritingStyle, currentIllustrationStyle]);

  const hasChanges = expertise !== currentExpertise || 
    tone !== currentTone || 
    writingStyle !== currentWritingStyle || 
    illustrationStyle !== currentIllustrationStyle;

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topics')
        .update({
          audience_expertise: expertise,
          default_tone: tone,
          default_writing_style: writingStyle,
          illustration_style: illustrationStyle,
          updated_at: new Date().toISOString()
        })
        .eq('id', topicId);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Content voice settings updated"
      });
      
      onUpdate?.();
    } catch (error) {
      console.error('Error updating settings:', error);
      toast({
        title: "Error",
        description: "Failed to save settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Mobile-first: stack on small screens, grid on larger */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Audience Expertise</Label>
          <Select value={expertise} onValueChange={(v: 'beginner' | 'intermediate' | 'expert') => setExpertise(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="beginner">Beginner</SelectItem>
              <SelectItem value="intermediate">Intermediate</SelectItem>
              <SelectItem value="expert">Expert</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Reading level and technical depth</p>
        </div>

        <div className="space-y-2">
          <Label>Content Tone</Label>
          <Select value={tone} onValueChange={(v: 'formal' | 'conversational' | 'engaging' | 'satirical') => setTone(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="formal">Formal</SelectItem>
              <SelectItem value="conversational">Conversational</SelectItem>
              <SelectItem value="engaging">Engaging</SelectItem>
              <SelectItem value="satirical">Satirical ⚡</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Voice and personality</p>
        </div>

        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            Writing Style
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <HelpCircle className="w-3.5 h-3.5 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-xs">Journalistic = news format. Educational = clear explanations. Listicle = numbered points. Story-driven = narrative.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </Label>
          <Select value={writingStyle} onValueChange={(v: 'journalistic' | 'educational' | 'listicle' | 'story_driven') => setWritingStyle(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="journalistic">Journalistic</SelectItem>
              <SelectItem value="educational">Educational</SelectItem>
              <SelectItem value="listicle">Listicle</SelectItem>
              <SelectItem value="story_driven">Story-driven</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Visual Style</Label>
          <Select value={illustrationStyle} onValueChange={(v: IllustrationStyle) => setIllustrationStyle(v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.EDITORIAL_ILLUSTRATIVE]}
              </SelectItem>
              <SelectItem value={ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC}>
                {ILLUSTRATION_STYLE_LABELS[ILLUSTRATION_STYLES.EDITORIAL_PHOTOGRAPHIC]}
              </SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Story cover image style</p>
        </div>
      </div>

      {hasChanges && (
        <Button onClick={handleSave} disabled={saving} size="sm" className="w-full sm:w-auto">
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      )}
    </div>
  );
};
