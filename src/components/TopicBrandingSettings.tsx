import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { Upload, X, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { padImageToSquare } from '@/lib/squareImage';

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
  const cfg = (topic.branding_config ?? {}) as Record<string, unknown>;
  const [colorMode, setColorMode] = useState<'single' | 'cycle' | 'random'>(
    (cfg.illustration_color_mode as 'single' | 'cycle' | 'random') || 'single'
  );
  const [palette, setPalette] = useState<string[]>(
    Array.isArray(cfg.illustration_color_palette) ? (cfg.illustration_color_palette as string[]) : []
  );
  const togglePalette = (c: string) =>
    setPalette((p) => (p.includes(c) ? p.filter((x) => x !== c) : [...p, c]));
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

  const uploadAndOptimizeImage = async (file: File, imageType: 'logo' | 'icon'): Promise<string> => {
    console.log(`Uploading and optimizing ${imageType}:`, { 
      fileName: file.name, 
      fileSize: file.size, 
      fileType: file.type, 
      topicId: topic.id 
    });

    // Convert file to base64
    const base64Data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    // Call the optimization edge function
    const { data, error } = await supabase.functions.invoke('optimize-branding-image', {
      body: {
        topicId: topic.id,
        imageType,
        base64Data,
        mimeType: file.type,
        originalFileName: file.name,
      }
    });

    if (error) {
      console.error(`${imageType} optimization error:`, error);
      throw new Error(`${imageType} optimization failed: ${error.message}`);
    }

    if (!data?.success) {
      throw new Error(`${imageType} optimization failed: ${data?.error || 'Unknown error'}`);
    }

    console.log(`${imageType} optimized successfully:`, {
      originalUrl: data.originalUrl,
      variants: Object.keys(data.variants || {}),
    });

    return data.originalUrl;
  };

  const uploadLogo = async (file: File): Promise<string> => {
    return uploadAndOptimizeImage(file, 'logo');
  };

  const uploadIcon = async (file: File): Promise<string> => {
    // Browsers stretch non-square favicons/app icons — pad to a square first
    const squared = await padImageToSquare(file);
    return uploadAndOptimizeImage(squared, 'icon');
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
        illustration_color_mode: colorMode,
        illustration_color_palette: palette,
        updated_at: new Date().toISOString()
      };

      console.log('Updating topic with branding config and illustration color:', brandingConfig, illustrationColor);

      const { error: updateError } = await supabase
        .from('topics')
        .update({ 
          branding_config: brandingConfig,
          illustration_primary_color: illustrationColor,
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
      <div className="space-y-6">
        <p className="text-sm text-muted-foreground">
          Customise how your feed appears to readers with a logo and custom subheader.
        </p>
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
                  className="w-24 h-24 object-contain border rounded-lg bg-muted/30"
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
              Illustration colour
            </Label>
            <p className="text-sm text-muted-foreground mb-3">
              Customize the primary color palette for story illustrations and visual elements
            </p>
            <div className="mb-4 inline-flex rounded-lg border border-border p-1" role="radiogroup" aria-label="Colour mode">
              {([
                ['single', 'One colour'],
                ['cycle', 'Cycle colours'],
                ['random', 'Random'],
              ] as const).map(([m, label]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={colorMode === m}
                  onClick={() => setColorMode(m)}
                  className={`px-3 py-1.5 text-sm rounded-md transition-colors ${colorMode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {colorMode === 'random' && (
              <p className="text-sm text-muted-foreground">
                Every new picture gets a fresh colour picked at random, so the feed never repeats itself.
              </p>
            )}

            {colorMode === 'single' && (
            <div className="flex items-center gap-4">
              <Input
                id="illustrationColor"
                type="color"
                value={illustrationColor}
                onChange={(e) => setIllustrationColor(e.target.value)}
                className="h-12 w-24 cursor-pointer"
              />
              <p className="text-sm font-medium text-foreground">{illustrationColor.toUpperCase()}</p>
            </div>
            )}

            {colorMode === 'cycle' && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pick two or more colours. New pictures take them in turn.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {palette.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => togglePalette(c)}
                      title="Remove"
                      aria-label={`Remove ${c}`}
                      className="w-10 h-10 rounded-md border-2 border-primary"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                  <label className="w-10 h-10 rounded-md border-2 border-dashed border-border flex items-center justify-center text-muted-foreground cursor-pointer relative" title="Add a colour">
                    +
                    <input
                      type="color"
                      aria-label="Add a colour"
                      className="absolute inset-0 opacity-0 cursor-pointer"
                      onChange={(e) => { const v = e.target.value; setPalette((p) => (p.includes(v) ? p : [...p, v])); }}
                    />
                  </label>
                </div>
              </div>
            )}

            {colorMode !== 'random' && (
            <div className="mt-4 flex flex-wrap gap-2">
              <p className="text-xs text-muted-foreground w-full mb-1">Quick presets{colorMode === 'cycle' ? ' (tap to add or remove)' : ''}:</p>
              {[
                { name: 'Blue', value: '#3b82f6' },
                { name: 'Green', value: '#22c55e' },
                { name: 'Red', value: '#ef4444' },
                { name: 'Purple', value: '#a855f7' },
                { name: 'Orange', value: '#f97316' },
                { name: 'Pink', value: '#ec4899' },
                { name: 'Teal', value: '#14b8a6' },
                { name: 'Amber', value: '#f59e0b' }
              ].map((preset) => {
                const active = colorMode === 'cycle' ? palette.includes(preset.value) : illustrationColor === preset.value;
                return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => colorMode === 'cycle' ? togglePalette(preset.value) : setIllustrationColor(preset.value)}
                  title={preset.name}
                  aria-pressed={active}
                >
                  <div
                    className={`w-10 h-10 rounded-md border-2 transition-colors ${active ? 'border-primary' : 'border-border hover:border-primary'}`}
                    style={{ backgroundColor: preset.value }}
                  />
                </button>
                );
              })}
            </div>
            )}
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
      </div>
    </div>
  );
}