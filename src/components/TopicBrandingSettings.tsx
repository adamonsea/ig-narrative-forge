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
    illustration_primary_color?: string;
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
  const [illustrationColor, setIllustrationColor] = useState(topic.illustration_primary_color || '#3b82f6');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const iconInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Convert hex to HSL format for storage
  const hexToHSL = (hex: string): string => {
    // Remove # if present
    const hexValue = hex.replace('#', '');
    
    // Convert hex to RGB
    const r = parseInt(hexValue.substring(0, 2), 16) / 255;
    const g = parseInt(hexValue.substring(2, 4), 16) / 255;
    const b = parseInt(hexValue.substring(4, 6), 16) / 255;
    
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0, s = 0, l = (max + min) / 2;
    
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    
    // Return in format: "hue saturation% lightness%"
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  };

  // Convert HSL to hex for display
  const hslToHex = (hsl: string): string => {
    if (hsl.startsWith('#')) return hsl; // Already hex
    
    // Parse HSL string "210 100% 50%"
    const parts = hsl.match(/(\d+)\s+(\d+)%\s+(\d+)%/);
    if (!parts) return '#3b82f6';
    
    const h = parseInt(parts[1]) / 360;
    const s = parseInt(parts[2]) / 100;
    const l = parseInt(parts[3]) / 100;
    
    let r, g, b;
    
    if (s === 0) {
      r = g = b = l;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1/6) return p + (q - p) * 6 * t;
        if (t < 1/2) return q;
        if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
        return p;
      };
      
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      
      r = hue2rgb(p, q, h + 1/3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1/3);
    }
    
    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

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

      console.log('Updating topic with branding config and illustration color:', brandingConfig, illustrationColor);

      const { error: updateError } = await supabase
        .from('topics')
        .update({ 
          branding_config: brandingConfig,
          illustration_primary_color: hexToHSL(illustrationColor),
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

          {/* Illustration Color Personalization */}
          <div>
            <Label htmlFor="illustrationColor" className="text-base font-medium">
              Illustration Primary Color
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Customize the primary color palette for story illustrations and visual elements
            </p>
            <div className="flex items-center gap-4">
              <div className="relative">
                <Input
                  id="illustrationColor"
                  type="color"
                  value={hslToHex(illustrationColor)}
                  onChange={(e) => setIllustrationColor(e.target.value)}
                  className="h-12 w-24 cursor-pointer"
                />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-foreground">
                  {hslToHex(illustrationColor).toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground">
                  This color will be used in editorial illustrations across all stories in this topic
                </p>
              </div>
            </div>
            
            {/* Color Preview Swatches */}
            <div className="mt-4 flex flex-wrap gap-2">
              <p className="text-xs text-muted-foreground w-full mb-1">Quick Presets:</p>
              {[
                { name: 'Blue', value: '#3b82f6' },
                { name: 'Green', value: '#22c55e' },
                { name: 'Red', value: '#ef4444' },
                { name: 'Purple', value: '#a855f7' },
                { name: 'Orange', value: '#f97316' },
                { name: 'Pink', value: '#ec4899' },
                { name: 'Teal', value: '#14b8a6' },
                { name: 'Amber', value: '#f59e0b' }
              ].map((preset) => (
                <button
                  key={preset.name}
                  onClick={() => setIllustrationColor(preset.value)}
                  className="group relative"
                  title={preset.name}
                >
                  <div
                    className="w-10 h-10 rounded-md border-2 border-border hover:border-primary transition-colors cursor-pointer"
                    style={{ backgroundColor: preset.value }}
                  />
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
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