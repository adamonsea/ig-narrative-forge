import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TopicBrandingSettingsProps {
  topic: {
    id: string;
    name: string;
    branding_config?: {
      logo_url?: string;
      subheader?: string;
      show_topic_name?: boolean;
    };
  };
  onUpdate: () => void;
}

export function TopicBrandingSettings({ topic, onUpdate }: TopicBrandingSettingsProps) {
  const [subheader, setSubheader] = useState(topic.branding_config?.subheader || '');
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>(topic.branding_config?.logo_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleLogoSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (2MB max)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Logo must be less than 2MB",
        variant: "destructive"
      });
      return;
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (PNG, JPG, WebP, SVG)",
        variant: "destructive"
      });
      return;
    }

    setLogoFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setLogoPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${topic.id}/logo.${fileExt}`;

    const { data, error } = await supabase.storage
      .from('topic-logos')
      .upload(fileName, file, {
        upsert: true,
        contentType: file.type
      });

    if (error) {
      throw error;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('topic-logos')
      .getPublicUrl(fileName);

    return publicUrl;
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let logoUrl = topic.branding_config?.logo_url;

      // Upload new logo if selected
      if (logoFile) {
        setUploading(true);
        logoUrl = await uploadLogo(logoFile);
        setUploading(false);
      } else if (!logoPreview) {
        // Remove logo if cleared
        logoUrl = undefined;
      }

      // Update topic branding config with cache-busting timestamp
      const brandingConfig = {
        ...topic.branding_config,
        logo_url: logoUrl,
        subheader: subheader.trim() || undefined,
        show_topic_name: !logoUrl, // Hide topic name when logo exists
        updated_at: new Date().toISOString() // Force cache refresh
      };

      const { error } = await supabase
        .from('topics')
        .update({ 
          branding_config: brandingConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', topic.id);

      if (error) {
        throw error;
      }

      toast({
        title: "Branding updated",
        description: "Your topic branding has been saved successfully"
      });

      onUpdate();
    } catch (error) {
      console.error('Error saving branding:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save branding",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Topic Branding</CardTitle>
          <CardDescription>
            Customize how your topic appears to readers with a logo and custom subheader
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Logo Upload */}
          <div>
            <Label className="text-base font-medium">Logo</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Upload a logo to replace your topic name. Recommended size: 200x60px, max 2MB
            </p>
            
            {logoPreview ? (
              <div className="relative inline-block">
                <img
                  src={logoPreview}
                  alt="Logo preview"
                  className="max-h-20 max-w-48 object-contain border rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 h-6 w-6 p-0"
                  onClick={removeLogo}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload logo or drag and drop
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  PNG, JPG, WebP, SVG up to 2MB
                </p>
              </div>
            )}
            
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoSelect}
              className="hidden"
            />
          </div>

          {/* Subheader */}
          <div>
            <Label htmlFor="subheader" className="text-base font-medium">
              Subheader
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Add a custom description that appears below your topic name or logo
            </p>
            <Textarea
              id="subheader"
              placeholder="Enter a custom subheader for your topic..."
              value={subheader}
              onChange={(e) => setSubheader(e.target.value)}
              maxLength={200}
              rows={3}
            />
            <p className="text-xs text-muted-foreground mt-1">
              {subheader.length}/200 characters
            </p>
          </div>

          {/* Preview */}
          <div>
            <Label className="text-base font-medium">Preview</Label>
            <div className="border rounded-lg p-6 bg-muted/50 mt-3">
              <div className="text-center">
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="max-h-16 mx-auto mb-2 object-contain"
                  />
                ) : (
                  <h1 className="text-2xl font-bold mb-2">{topic.name}</h1>
                )}
                {subheader && (
                  <p className="text-muted-foreground text-sm max-w-md mx-auto">
                    {subheader}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Save Button */}
          <Button 
            onClick={handleSave} 
            disabled={saving || uploading}
            className="w-full"
          >
            {uploading ? (
              <>
                <Upload className="w-4 h-4 mr-2 animate-spin" />
                Uploading Logo...
              </>
            ) : saving ? (
              "Saving..."
            ) : (
              "Save Branding"
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}