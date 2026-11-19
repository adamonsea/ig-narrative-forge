import { useState, useRef } from 'react';
import { READER_ONBOARDING_EXTRAS } from '@/lib/featureFlags';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SaveIndicator, type SaveState } from '@/components/ui/editorial';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Upload, X, Loader2, ExternalLink } from 'lucide-react';

interface OnboardingSettingsProps {
  topic: {
    id: string;
    name: string;
    slug?: string | undefined;
    branding_config?: {
      welcome_card_enabled?: boolean | undefined;
      welcome_card_headline?: string | undefined;
      welcome_card_cta_text?: string | undefined;
      welcome_card_about_link?: boolean | undefined;
      about_page_enabled?: boolean | undefined;
      about_page_content?: string | undefined;
      about_page_photo_url?: string | undefined;
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
  const [state, setState] = useState<SaveState>(null);
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
      await save({ about_page_photo_url: publicUrl });
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
    save({ about_page_photo_url: '' });
  };

  const handlePreview = () => {
    // Use actual slug if available, otherwise derive from name
    const slug = topic.slug || topic.name.toLowerCase().replace(/\s+/g, '-');
    
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

  /** Save as you go: merge into the stored branding settings so nothing else there is overwritten. */
  const save = async (patch: Record<string, unknown>) => {
    setState('saving');
    try {
      const { data: row, error: readError } = await supabase.from('topics').select('branding_config').eq('id', topic.id).single();
      if (readError) throw readError;
      const merged = { ...((row?.branding_config as Record<string, unknown>) || {}), ...patch };
      const { error } = await supabase
        .from('topics')
        .update({ branding_config: merged as never, updated_at: new Date().toISOString() })
        .eq('id', topic.id);
      if (error) throw error;
      setState('saved');
      onUpdate();
      window.setTimeout(() => setState(null), 2000);
    } catch (error) {
      console.error('Error saving onboarding settings:', error);
      setState('not-saved');
    }
  };

  return (
    <div className="space-y-6">
        {/* Welcome card: hidden while reader welcome extras are paused (saved values are kept) */}
        {READER_ONBOARDING_EXTRAS && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <Label className="text-base font-medium">Welcome card</Label>
            </div>
            <Switch
              checked={welcomeEnabled}
              onCheckedChange={(v) => { setWelcomeEnabled(v); save({ welcome_card_enabled: v }); }}
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
                  onBlur={() => { if (welcomeHeadline !== (config.welcome_card_headline || '')) save({ welcome_card_headline: welcomeHeadline }); }}
                  placeholder={`Welcome to ${topic.name}`}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="welcomeCtaText">Button text</Label>
                <Input
                  id="welcomeCtaText"
                  value={welcomeCtaText}
                  onChange={(e) => setWelcomeCtaText(e.target.value)}
                  onBlur={() => { if (welcomeCtaText !== (config.welcome_card_cta_text || '')) save({ welcome_card_cta_text: welcomeCtaText }); }}
                  placeholder="Start Reading"
                  className="mt-1"
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>About link</Label>
                <Switch
                  checked={showAboutLink}
                  onCheckedChange={(v) => { setShowAboutLink(v); save({ welcome_card_about_link: v }); }}
                  disabled={!aboutPageEnabled}
                />
              </div>
            </div>
          )}
        </div>
        )}

        {/* About Page */}
        <div className={READER_ONBOARDING_EXTRAS ? "space-y-4 pt-4 border-t" : "space-y-4"}>
          <div className="flex items-center justify-between">
            <Label htmlFor="about-page-on" className="text-base font-medium">About page</Label>
            <div className="flex items-center gap-3">
            <SaveIndicator state={state} />
            <Switch
              id="about-page-on"
              checked={aboutPageEnabled}
              onCheckedChange={(v) => { setAboutPageEnabled(v); save({ about_page_enabled: v }); }}
            />
            </div>
          </div>

          {aboutPageEnabled && (
            <div className="space-y-4 pl-4 border-l-2 border-muted">
              {/* Image Upload */}
              <div>
                <Label className="mb-2 block text-sm font-medium">Photo</Label>
                
                {aboutPhotoUrl ? (
                  <div className="w-full max-w-xs space-y-2">
                    <img
                      src={aboutPhotoUrl}
                      alt="About page photo"
                      className="h-32 w-full rounded-lg border border-border object-cover"
                    />
                    <Button variant="ghost" size="sm" onClick={handleRemoveImage} className="gap-2">
                      <X className="h-4 w-4" aria-hidden="true" />
                      Remove
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
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="h-4 w-4" />
                          Upload
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </div>

              {/* About Content */}
              <div>
                <Label htmlFor="aboutContent">Text</Label>
                <textarea
                  id="aboutContent"
                  value={aboutContent}
                  onChange={(e) => setAboutContent(e.target.value)}
                  onBlur={() => { if (aboutContent !== (config.about_page_content || '')) save({ about_page_content: aboutContent }); }}
                  placeholder="Who curates this feed and what readers can expect"
                  className="mt-2 min-h-[120px] w-full resize-y rounded-lg border border-input bg-background p-3 text-base"
                  maxLength={2000}
                />
                <p className="text-sm text-muted-foreground mt-1">
                  {aboutContent.length}/2000
                </p>
              </div>
            </div>
          )}
        </div>

        {READER_ONBOARDING_EXTRAS && welcomeEnabled && (
          <Button variant="outline" onClick={handlePreview} className="gap-2">
            <ExternalLink className="h-4 w-4" />
            Preview
          </Button>
        )}
    </div>
  );
}
