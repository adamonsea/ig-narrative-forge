import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface OnboardingSettingsProps {
  topic: {
    id: string;
    name: string;
    branding_config?: {
      welcome_card_enabled?: boolean;
      welcome_card_headline?: string;
      welcome_card_cta_text?: string;
      welcome_card_about_link?: boolean;
      about_page_enabled?: boolean;
      about_page_content?: string;
      [key: string]: any;
    };
  };
  onUpdate: () => void;
}

export function OnboardingSettings({ topic, onUpdate }: OnboardingSettingsProps) {
  const config = topic.branding_config || {};
  
  const [welcomeEnabled, setWelcomeEnabled] = useState(config.welcome_card_enabled ?? false);
  const [welcomeHeadline, setWelcomeHeadline] = useState(config.welcome_card_headline || `Welcome to ${topic.name}`);
  const [welcomeCtaText, setWelcomeCtaText] = useState(config.welcome_card_cta_text || 'Start Reading');
  const [showAboutLink, setShowAboutLink] = useState(config.welcome_card_about_link ?? false);
  const [aboutPageEnabled, setAboutPageEnabled] = useState(config.about_page_enabled ?? false);
  const [aboutContent, setAboutContent] = useState(config.about_page_content || '');
  const [saving, setSaving] = useState(false);
  
  const { toast } = useToast();

  const handleSave = async () => {
    setSaving(true);
    
    try {
      const updatedConfig = {
        ...config,
        welcome_card_enabled: welcomeEnabled,
        welcome_card_headline: welcomeHeadline,
        welcome_card_cta_text: welcomeCtaText,
        welcome_card_about_link: showAboutLink,
        about_page_enabled: aboutPageEnabled,
        about_page_content: aboutContent,
      };

      const { error } = await supabase
        .from('topics')
        .update({ 
          branding_config: updatedConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', topic.id);

      if (error) throw error;

      toast({
        title: "Settings saved",
        description: "Onboarding settings have been updated"
      });

      onUpdate();
    } catch (error) {
      console.error('Error saving onboarding settings:', error);
      toast({
        title: "Save failed",
        description: "Failed to save onboarding settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Onboarding & Welcome</CardTitle>
        <CardDescription>
          Configure how new visitors are welcomed to your feed
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Welcome Flash Card */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Welcome Card</Label>
              <p className="text-sm text-muted-foreground">
                Show a welcome modal to first-time visitors
              </p>
            </div>
            <Switch
              checked={welcomeEnabled}
              onCheckedChange={setWelcomeEnabled}
            />
          </div>

          {welcomeEnabled && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              <div>
                <Label htmlFor="welcomeHeadline">Headline</Label>
                <Input
                  id="welcomeHeadline"
                  value={welcomeHeadline}
                  onChange={(e) => setWelcomeHeadline(e.target.value)}
                  placeholder={`Welcome to ${topic.name}`}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="welcomeCtaText">Button Text</Label>
                <Input
                  id="welcomeCtaText"
                  value={welcomeCtaText}
                  onChange={(e) => setWelcomeCtaText(e.target.value)}
                  placeholder="Start Reading"
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <Label>Show "About this feed" link</Label>
                  <p className="text-xs text-muted-foreground">
                    Requires About Page to be enabled
                  </p>
                </div>
                <Switch
                  checked={showAboutLink}
                  onCheckedChange={setShowAboutLink}
                  disabled={!aboutPageEnabled}
                />
              </div>
            </div>
          )}
        </div>

        {/* About Page */}
        <div className="space-y-4 pt-4 border-t">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">About Page</Label>
              <p className="text-sm text-muted-foreground">
                Enable a dedicated page about your feed (shows ? icon in header)
              </p>
            </div>
            <Switch
              checked={aboutPageEnabled}
              onCheckedChange={setAboutPageEnabled}
            />
          </div>

          {aboutPageEnabled && (
            <div className="pl-4 border-l-2 border-muted">
              <Label htmlFor="aboutContent">About Page Content</Label>
              <textarea
                id="aboutContent"
                value={aboutContent}
                onChange={(e) => setAboutContent(e.target.value)}
                placeholder="Tell visitors about your feed, what content they can expect, and who curates it..."
                className="w-full mt-1 p-3 border rounded-md min-h-[120px] text-sm resize-y bg-background"
                maxLength={2000}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {aboutContent.length}/2000 characters
              </p>
            </div>
          )}
        </div>

        <Button onClick={handleSave} disabled={saving} className="w-full">
          {saving ? "Saving..." : "Save Onboarding Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}
