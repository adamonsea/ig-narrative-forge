import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, Code, Eye, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface TopicData {
  id: string;
  name: string;
  slug: string;
  public_widget_builder_enabled: boolean;
  branding_config?: {
    primary_color?: string;
    logo_url?: string;
  } | null;
}

interface WidgetConfig {
  maxHeadlines: number;
  theme: 'auto' | 'light' | 'dark';
  accent: string;
  width: string;
}

interface PreviewStory {
  title: string;
  url: string;
  source_name?: string;
}

export default function PublicWidgetBuilder() {
  const { slug } = useParams<{ slug: string }>();
  const { toast } = useToast();
  
  const [topic, setTopic] = useState<TopicData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [copied, setCopied] = useState(false);
  const [previewData, setPreviewData] = useState<{ feed: TopicData | null; stories: PreviewStory[] } | null>(null);
  
  const [config, setConfig] = useState<WidgetConfig>({
    maxHeadlines: 5,
    theme: 'auto',
    accent: '',
    width: '100%',
  });

  // Load topic data
  useEffect(() => {
    const loadTopic = async () => {
      if (!slug) return;
      
      const { data, error } = await supabase
        .from('topics')
        .select('id, name, slug, public_widget_builder_enabled, branding_config')
        .eq('slug', slug)
        .eq('is_public', true)
        .single();
      
      if (error || !data) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      
      if (!data.public_widget_builder_enabled) {
        setNotFound(true);
        setLoading(false);
        return;
      }
      
      setTopic(data as unknown as TopicData);
      
      // Set default accent from branding config
      const brandingConfig = data.branding_config as TopicData['branding_config'];
      if (brandingConfig?.primary_color) {
        setConfig(prev => ({
          ...prev,
          accent: brandingConfig.primary_color || ''
        }));
      }
      
      setLoading(false);
    };
    
    loadTopic();
  }, [slug]);

  // Fetch preview data
  useEffect(() => {
    const fetchPreview = async () => {
      if (!slug) return;
      
      try {
        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL || 'https://eezeenews.supabase.co'}/functions/v1/widget-feed-data?feed=${slug}&max=${config.maxHeadlines}`
        );
        
        if (response.ok) {
          const data = await response.json();
          setPreviewData(data);
        }
      } catch (err) {
        console.error('Failed to fetch preview:', err);
      }
    };
    
    fetchPreview();
  }, [slug, config.maxHeadlines]);

  const generateEmbedCode = () => {
    if (!slug) return '';
    
    let code = `<div id="curatr-widget" data-feed="${slug}"`;
    
    if (config.maxHeadlines !== 5) {
      code += ` data-max="${config.maxHeadlines}"`;
    }
    if (config.theme !== 'auto') {
      code += ` data-theme="${config.theme}"`;
    }
    if (config.accent) {
      code += ` data-accent="${config.accent}"`;
    }
    if (config.width !== '100%') {
      code += ` data-width="${config.width}"`;
    }
    
    code += `></div>\n<script src="${window.location.origin}/widget.js" async></script>`;
    
    return code;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(generateEmbedCode());
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Embed code copied to clipboard",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      toast({
        title: "Failed to copy",
        description: "Please select and copy manually",
        variant: "destructive",
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (notFound || !topic) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <Helmet>
          <title>Widget Builder Not Available</title>
        </Helmet>
        <h1 className="text-2xl font-bold mb-2">Widget Builder Not Available</h1>
        <p className="text-muted-foreground mb-4">This feed doesn't have a public widget builder enabled.</p>
        <Link to={`/feed/${slug}`}>
          <Button variant="outline">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Feed
          </Button>
        </Link>
      </div>
    );
  }

  const effectiveTheme = config.theme === 'auto' 
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : config.theme;
  
  const isDark = effectiveTheme === 'dark';
  const accentColor = config.accent || topic.branding_config?.primary_color || '#3b82f6';
  const logoUrl = topic.branding_config?.logo_url;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Embed {topic.name} Widget | Curatr</title>
        <meta name="description" content={`Add ${topic.name} headlines to your website with an embeddable widget`} />
      </Helmet>

      {/* Header */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to={`/feed/${slug}`} className="text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              {logoUrl ? (
                <img src={logoUrl} alt={topic.name} className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ background: accentColor }}
                >
                  {topic.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-semibold">{topic.name} Widget</h1>
                <p className="text-sm text-muted-foreground">Embed headlines on your website</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-2 gap-8">
          {/* Configuration */}
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Code className="w-5 h-5" />
                  Configure Widget
                </CardTitle>
                <CardDescription>
                  Customize how the widget appears on your website
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Headlines to show</Label>
                  <Select
                    value={String(config.maxHeadlines)}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, maxHeadlines: parseInt(v) }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[3, 5, 7, 10].map(n => (
                        <SelectItem key={n} value={String(n)}>{n} headlines</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Theme</Label>
                  <Select
                    value={config.theme}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, theme: v as WidgetConfig['theme'] }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">Auto (match system)</SelectItem>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Width</Label>
                  <Select
                    value={config.width}
                    onValueChange={(v) => setConfig(prev => ({ ...prev, width: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="100%">Full width</SelectItem>
                      <SelectItem value="400px">400px</SelectItem>
                      <SelectItem value="350px">350px</SelectItem>
                      <SelectItem value="300px">300px</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Accent color</Label>
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => setConfig(prev => ({ ...prev, accent: e.target.value }))}
                      className="w-10 h-10 rounded border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={config.accent || accentColor}
                      onChange={(e) => setConfig(prev => ({ ...prev, accent: e.target.value }))}
                      placeholder={accentColor}
                      className="flex-1 px-3 py-2 border rounded-md bg-background text-sm"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Embed code */}
            <Card>
              <CardHeader>
                <CardTitle>Embed Code</CardTitle>
                <CardDescription>
                  Copy and paste this code into your website's HTML
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto font-mono">
                    {generateEmbedCode()}
                  </pre>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="absolute top-2 right-2"
                    onClick={handleCopy}
                  >
                    {copied ? (
                      <>
                        <Check className="w-4 h-4 mr-1" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-1" />
                        Copy
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Eye className="w-5 h-5" />
              <span className="font-medium">Preview</span>
            </div>
            
            <Tabs defaultValue={effectiveTheme} className="w-full">
              <TabsList className="mb-4">
                <TabsTrigger value="light">Light</TabsTrigger>
                <TabsTrigger value="dark">Dark</TabsTrigger>
              </TabsList>
              
              <TabsContent value="light">
                <div className="p-6 bg-white rounded-lg border" style={{ maxWidth: config.width }}>
                  <WidgetPreview 
                    data={previewData} 
                    theme="light" 
                    accent={accentColor}
                    topicName={topic.name}
                  />
                </div>
              </TabsContent>
              
              <TabsContent value="dark">
                <div className="p-6 bg-zinc-900 rounded-lg border border-zinc-700" style={{ maxWidth: config.width }}>
                  <WidgetPreview 
                    data={previewData} 
                    theme="dark" 
                    accent={accentColor}
                    topicName={topic.name}
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </main>
    </div>
  );
}

// Inline preview component
function WidgetPreview({ 
  data, 
  theme, 
  accent, 
  topicName 
}: { 
  data: { feed: TopicData | null; stories: PreviewStory[] } | null; 
  theme: 'light' | 'dark'; 
  accent: string;
  topicName: string;
}) {
  const isDark = theme === 'dark';
  const textColor = isDark ? '#f3f4f6' : '#1f2937';
  const mutedColor = isDark ? '#9ca3af' : '#6b7280';
  const bgColor = isDark ? '#18181b' : '#ffffff';
  const borderColor = isDark ? '#27272a' : '#e5e7eb';
  const sourceBg = isDark ? '#27272a' : '#f3f4f6';

  if (!data) {
    return (
      <div className="text-center py-8" style={{ color: mutedColor }}>
        Loading preview...
      </div>
    );
  }

  return (
    <div 
      className="rounded-lg border overflow-hidden"
      style={{ 
        background: bgColor, 
        borderColor: borderColor,
        fontFamily: 'system-ui, -apple-system, sans-serif'
      }}
    >
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-2" style={{ borderColor }}>
        {data.feed?.branding_config?.logo_url ? (
          <img src={data.feed.branding_config.logo_url} alt="" className="w-6 h-6 rounded-full object-cover" />
        ) : (
          <div 
            className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: accent }}
          >
            {topicName.charAt(0)}
          </div>
        )}
        <span className="font-semibold text-sm" style={{ color: textColor }}>
          {topicName}
        </span>
      </div>

      {/* Stories */}
      <div className="divide-y" style={{ borderColor }}>
        {data.stories.map((story, i) => (
          <div key={i} className="p-3 flex items-start gap-2">
            <div 
              className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" 
              style={{ background: accent }}
            />
            <div className="flex-1 min-w-0">
              <div 
                className="text-sm font-medium leading-snug"
                style={{ color: textColor }}
              >
                {story.title}
              </div>
              {story.source_name && (
                <span 
                  className="inline-block mt-1 text-xs px-1.5 py-0.5 rounded"
                  style={{ 
                    background: sourceBg, 
                    color: mutedColor 
                  }}
                >
                  {story.source_name}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div 
        className="px-3 py-2 border-t text-xs text-center"
        style={{ borderColor, color: mutedColor }}
      >
        Powered by <span style={{ color: accent }}>curatr.pro</span>
      </div>
    </div>
  );
}
