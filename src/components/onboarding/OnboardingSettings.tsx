import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, Loader2, ExternalLink } from 'lucide-react';

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
      about_page_photo_url?: string;
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
  const [aboutPhotoUrl, setAboutPhotoUrl] = useState(config.about_page_photo_url || '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file",
        variant: "destructive"
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `about-photo.${fileExt}`;
      const filePath = `${topic.id}/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('topic-assets')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('topic-assets')
        .getPublicUrl(filePath);

      setAboutPhotoUrl(publicUrl);
      
      toast({
        title: "Image uploaded",
        description: "Don't forget to save your settings"
      });
    } catch (error) {
      console.error('Error uploading image:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload image",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
      // Reset input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveImage = () => {
    setAboutPhotoUrl('');
  };

  const handlePreview = () => {
    const slug = topic.name.toLowerCase().replace(/\s+/g, '-');
    
    // Clear localStorage for this topic's onboarding state
    localStorage.removeItem(`welcome_shown_${slug}`);
    localStorage.removeItem(`onboarding_complete_${slug}`);
    
    toast({
      title: "Preview mode enabled",
      description: "Opening feed with fresh onboarding..."
    });
    
    // Open the feed in a new tab
    window.open(`/feed/${slug}`, '_blank');
  };

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
        about_page_photo_url: aboutPhotoUrl,
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
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              {/* Image Upload */}
              <div>
                <Label>About Page Photo</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Add an image to personalize your about page
                </p>
                
                {aboutPhotoUrl ? (
                  <div className="relative w-full max-w-xs">
                    <img 
                      src={aboutPhotoUrl} 
                      alt="About page preview" 
                      className="w-full h-32 object-cover rounded-md border"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute -top-2 -right-2 h-6 w-6"
                      onClick={handleRemoveImage}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload}
                      className="hidden"
                    />
                    <Button
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="gap-2"
                    >
                      {uploading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload Image
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* About Content */}
              <div>
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
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button onClick={handleSave} disabled={saving} className="flex-1">
            {saving ? "Saving..." : "Save Settings"}
          </Button>
          {welcomeEnabled && (
            <Button variant="outline" onClick={handlePreview} className="gap-2">
              <ExternalLink className="h-4 w-4" />
              Preview
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
