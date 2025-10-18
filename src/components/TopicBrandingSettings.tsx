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
      icon_url?: string;
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
  const [iconFile, setIconFile] = useState<File | null>(null);
  const [iconPreview, setIconPreview] = useState<string>(topic.branding_config?.icon_url || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
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

  const handleIconSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file size (1MB max for icons)
    if (file.size > 1 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Icon must be less than 1MB",
        variant: "destructive"
      });
      return;
    }

    // Validate file type (prefer square images for icons)
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please select an image file (PNG, JPG, WebP, SVG)",
        variant: "destructive"
      });
      return;
    }

    setIconFile(file);
    
    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setIconPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const removeLogo = () => {
    setLogoFile(null);
    setLogoPreview('');
    if (logoInputRef.current) {
      logoInputRef.current.value = '';
    }
  };

  const removeIcon = () => {
    setIconFile(null);
    setIconPreview('');
    if (iconInputRef.current) {
      iconInputRef.current.value = '';
    }
  };

  const uploadLogo = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${topic.id}/logo.${fileExt}`;

    console.log('Uploading logo:', { fileName, fileSize: file.size, fileType: file.type, topicId: topic.id });

    const { data, error } = await supabase.storage
      .from('topic-logos')
      .upload(fileName, file, {
        upsert: true,
        contentType: file.type
      });

    if (error) {
      console.error('Storage upload error:', error);
      throw new Error(`Storage upload failed: ${error.message} (Path: ${fileName})`);
    }

    console.log('Upload successful:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('topic-logos')
      .getPublicUrl(fileName);

    console.log('Generated public URL:', publicUrl);
    return publicUrl;
  };

  const uploadIcon = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${topic.id}/icon.${fileExt}`;

    console.log('Uploading icon:', { fileName, fileSize: file.size, fileType: file.type, topicId: topic.id });

    const { data, error } = await supabase.storage
      .from('topic-icons')
      .upload(fileName, file, {
        upsert: true,
        contentType: file.type
      });

    if (error) {
      console.error('Icon upload error:', error);
      throw new Error(`Icon upload failed: ${error.message} (Path: ${fileName})`);
    }

    console.log('Icon upload successful:', data);

    const { data: { publicUrl } } = supabase.storage
      .from('topic-icons')
      .getPublicUrl(fileName);

    console.log('Generated icon public URL:', publicUrl);
    return publicUrl;
  };

  const handleSave = async () => {
    setSaving(true);
    console.log('Starting branding save process for topic:', topic.id);
    
    try {
      let logoUrl = topic.branding_config?.logo_url;
      let iconUrl = topic.branding_config?.icon_url;

      setUploading(true);

      // Upload new logo if selected
      if (logoFile) {
        console.log('Uploading new logo file:', logoFile.name);
        try {
          logoUrl = await uploadLogo(logoFile);
          console.log('Logo upload completed, URL:', logoUrl);
        } catch (uploadError) {
          setUploading(false);
          throw new Error(`Logo upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown upload error'}`);
        }
      } else if (!logoPreview) {
        console.log('Removing logo from branding config');
        logoUrl = undefined;
      }

      // Upload new icon if selected
      if (iconFile) {
        console.log('Uploading new icon file:', iconFile.name);
        try {
          iconUrl = await uploadIcon(iconFile);
          console.log('Icon upload completed, URL:', iconUrl);
        } catch (uploadError) {
          setUploading(false);
          throw new Error(`Icon upload failed: ${uploadError instanceof Error ? uploadError.message : 'Unknown upload error'}`);
        }
      } else if (!iconPreview) {
        console.log('Removing icon from branding config');
        iconUrl = undefined;
      }

      setUploading(false);

      // Update topic branding config with cache-busting timestamp
      const brandingConfig = {
        ...topic.branding_config,
        logo_url: logoUrl,
        icon_url: iconUrl,
        subheader: subheader.trim() || undefined,
        show_topic_name: !logoUrl,
        updated_at: new Date().toISOString()
      };

      console.log('Updating topic with branding config:', brandingConfig);

      const { error: updateError } = await supabase
        .from('topics')
        .update({ 
          branding_config: brandingConfig,
          updated_at: new Date().toISOString()
        })
        .eq('id', topic.id);

      if (updateError) {
        console.error('Topic update error:', updateError);
        throw new Error(`Database update failed: ${updateError.message} (Topic ID: ${topic.id})`);
      }

      console.log('Branding save completed successfully');
      toast({
        title: "Branding updated",
        description: "Your topic branding has been saved successfully"
      });

      onUpdate();
    } catch (error) {
      console.error('Error saving branding:', error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save branding";
      toast({
        title: "Branding Save Failed",
        description: errorMessage,
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
            <Label className="text-base font-medium">Logo (Header Branding)</Label>
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
                onClick={() => logoInputRef.current?.click()}
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
              ref={logoInputRef}
              type="file"
              accept="image/*"
              onChange={handleLogoSelect}
              className="hidden"
            />
          </div>

          {/* Icon Upload */}
          <div>
            <Label className="text-base font-medium">App Icon (PWA/Favicon)</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Upload an icon for browser favicon and mobile home screen. Recommended: 512x512px square, max 1MB
            </p>
            
            {iconPreview ? (
              <div className="relative inline-block">
                <img
                  src={iconPreview}
                  alt="Icon preview"
                  className="w-24 h-24 object-cover border rounded-lg"
                />
                <Button
                  variant="destructive"
                  size="sm"
                  className="absolute -top-2 -right-2 h-6 w-6 p-0"
                  onClick={removeIcon}
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
            ) : (
              <div
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                onClick={() => iconInputRef.current?.click()}
              >
                <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Click to upload app icon
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Square PNG, JPG, WebP up to 1MB
                </p>
              </div>
            )}
            
            <input
              ref={iconInputRef}
              type="file"
              accept="image/*"
              onChange={handleIconSelect}
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