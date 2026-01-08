import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Copy, Check, ExternalLink, Code2, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useTopics } from "@/hooks/useTopics";
import { AppLayout } from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1";
const WIDGET_SCRIPT_URL = "https://curatr.pro/widget.js";

interface WidgetConfig {
  feed: string;
  max: number;
  theme: "auto" | "light" | "dark";
  accent: string;
  showAttribution: boolean;
}

export default function Widgets() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: topics, isLoading: topicsLoading } = useTopics();

  const [config, setConfig] = useState<WidgetConfig>({
    feed: "",
    max: 5,
    theme: "auto",
    accent: "",
    showAttribution: true,
  });

  const [copied, setCopied] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Set default feed when topics load
  useEffect(() => {
    if (topics && topics.length > 0 && !config.feed) {
      setConfig(prev => ({ ...prev, feed: topics[0].slug }));
    }
  }, [topics, config.feed]);

  // Fetch preview data when feed changes
  useEffect(() => {
    if (!config.feed) return;

    setPreviewLoading(true);
    fetch(`${SUPABASE_URL}/widget-feed-data?feed=${config.feed}&max=${config.max}`)
      .then(res => res.json())
      .then(data => {
        setPreviewData(data);
        // Set accent from feed if not overridden
        if (!config.accent && data.feed?.brand_color) {
          setConfig(prev => ({ ...prev, accent: data.feed.brand_color }));
        }
      })
      .catch(err => console.error("Preview fetch error:", err))
      .finally(() => setPreviewLoading(false));
  }, [config.feed, config.max]);

  const generateEmbedCode = () => {
    const attrs = [`data-feed="${config.feed}"`];
    if (config.max !== 5) attrs.push(`data-max="${config.max}"`);
    if (config.theme !== "auto") attrs.push(`data-theme="${config.theme}"`);
    if (config.accent) attrs.push(`data-accent="${config.accent}"`);

    return `<!-- Curatr Widget -->
<div id="curatr-widget" ${attrs.join(" ")}></div>
<script src="${WIDGET_SCRIPT_URL}" async></script>`;
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generateEmbedCode());
    setCopied(true);
    toast.success("Embed code copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  if (authLoading || topicsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const selectedTopic = topics?.find(t => t.slug === config.feed);
  const accentColor = config.accent || previewData?.feed?.brand_color || "#3b82f6";

  return (
    <AppLayout>
      <Helmet>
        <title>Widget Builder | Curatr</title>
      </Helmet>

      <div className="container max-w-6xl py-8 space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Widget Builder</h1>
          <p className="text-muted-foreground mt-2">
            Embed your feed headlines on any website
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Configuration Panel */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Configure Widget
              </CardTitle>
              <CardDescription>
                Choose your feed and customize the appearance
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Feed Selection */}
              <div className="space-y-2">
                <Label htmlFor="feed">Feed</Label>
                <Select
                  value={config.feed}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, feed: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a feed" />
                  </SelectTrigger>
                  <SelectContent>
                    {topics?.map(topic => (
                      <SelectItem key={topic.id} value={topic.slug}>
                        {topic.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Max Headlines */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>Headlines to show</Label>
                  <span className="text-sm text-muted-foreground">{config.max}</span>
                </div>
                <Slider
                  value={[config.max]}
                  onValueChange={([value]) => setConfig(prev => ({ ...prev, max: value }))}
                  min={3}
                  max={10}
                  step={1}
                />
              </div>

              {/* Theme */}
              <div className="space-y-3">
                <Label>Theme</Label>
                <RadioGroup
                  value={config.theme}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, theme: value as any }))}
                  className="flex gap-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="auto" id="theme-auto" />
                    <Label htmlFor="theme-auto" className="font-normal cursor-pointer">Auto</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="light" id="theme-light" />
                    <Label htmlFor="theme-light" className="font-normal cursor-pointer">Light</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="dark" id="theme-dark" />
                    <Label htmlFor="theme-dark" className="font-normal cursor-pointer">Dark</Label>
                  </div>
                </RadioGroup>
              </div>

              {/* Accent Color */}
              <div className="space-y-2">
                <Label htmlFor="accent">Accent Color (optional)</Label>
                <div className="flex gap-2">
                  <Input
                    id="accent"
                    type="text"
                    placeholder="#3b82f6"
                    value={config.accent}
                    onChange={(e) => setConfig(prev => ({ ...prev, accent: e.target.value }))}
                    className="font-mono"
                  />
                  <Input
                    type="color"
                    value={config.accent || "#3b82f6"}
                    onChange={(e) => setConfig(prev => ({ ...prev, accent: e.target.value }))}
                    className="w-12 p-1 h-10"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Leave empty to use feed's brand color
                </p>
              </div>

              {/* Attribution Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="attribution">Show Attribution</Label>
                  <p className="text-xs text-muted-foreground">Display "Powered by Curatr"</p>
                </div>
                <Switch
                  id="attribution"
                  checked={config.showAttribution}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, showAttribution: checked }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Preview Panel */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Preview
                </CardTitle>
                <CardDescription>
                  How your widget will appear on external sites
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="rounded-lg p-4"
                  style={{ 
                    background: config.theme === "dark" ? "#0a0a0a" : 
                               config.theme === "light" ? "#f5f5f5" : 
                               "linear-gradient(135deg, #f5f5f5 50%, #0a0a0a 50%)"
                  }}
                >
                  {previewLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin" />
                    </div>
                  ) : previewData?.error ? (
                    <div className="text-center py-8 text-muted-foreground">
                      Unable to load preview
                    </div>
                  ) : (
                    <WidgetPreview 
                      data={previewData} 
                      theme={config.theme === "auto" ? "light" : config.theme}
                      accent={accentColor}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Embed Code */}
            <Card>
              <CardHeader>
                <CardTitle>Embed Code</CardTitle>
                <CardDescription>
                  Add this snippet to your website's HTML
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <pre className="bg-muted p-4 rounded-lg text-sm overflow-x-auto whitespace-pre-wrap font-mono">
                  {generateEmbedCode()}
                </pre>
                <Button onClick={handleCopy} className="w-full">
                  {copied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy Embed Code
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}

// Inline preview component (simulates the widget appearance)
function WidgetPreview({ 
  data, 
  theme, 
  accent 
}: { 
  data: any; 
  theme: "light" | "dark"; 
  accent: string;
}) {
  if (!data?.feed || !data?.stories) {
    return <div className="text-center py-4 text-muted-foreground">No data</div>;
  }

  const isDark = theme === "dark";
  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#1a1a1a";
  const textMuted = isDark ? "#a0a0a0" : "#6b7280";
  const border = isDark ? "#333333" : "#e5e7eb";

  return (
    <div 
      className="rounded-xl p-4"
      style={{ 
        background: bg, 
        border: `1px solid ${border}`,
        color: text,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        fontSize: "14px"
      }}
    >
      {/* Header */}
      <div 
        className="flex items-center gap-2.5 pb-3 mb-3"
        style={{ borderBottom: `1px solid ${border}` }}
      >
        {(data.feed.icon_url || data.feed.logo_url) ? (
          <img 
            src={data.feed.icon_url || data.feed.logo_url} 
            alt={data.feed.name}
            className="w-7 h-7 rounded-full object-cover"
          />
        ) : (
          <div 
            className="w-7 h-7 rounded-full flex items-center justify-center text-white font-semibold text-sm"
            style={{ background: accent }}
          >
            {data.feed.name.charAt(0)}
          </div>
        )}
        <span className="font-semibold">{data.feed.name}</span>
      </div>

      {/* Stories */}
      <div className="space-y-1">
        {data.stories.map((story: any, idx: number) => (
          <div 
            key={idx}
            className="flex items-start gap-2.5 p-2 rounded-lg transition-colors"
            style={{ 
              marginLeft: "-8px", 
              marginRight: "-8px",
            }}
          >
            <div 
              className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
              style={{ background: accent }}
            />
            <div className="flex-1 min-w-0">
              <a 
                href={story.url}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium line-clamp-2 hover:underline block"
                style={{ color: text }}
              >
                {story.title}
              </a>
              {story.source_name && (
                <span 
                  className="inline-block text-xs px-1.5 py-0.5 rounded mt-1"
                  style={{ background: isDark ? '#2a2a2a' : '#f3f4f6', color: textMuted }}
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
        className="flex justify-between items-center pt-3 mt-3 flex-wrap gap-2"
        style={{ borderTop: `1px solid ${border}` }}
      >
        <a 
          href={`https://curatr.pro/feed/${data.feed.slug}`}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-sm no-underline hover:underline"
          style={{ color: accent }}
        >
          View all stories →
        </a>
        <span className="text-xs" style={{ color: textMuted }}>
          Powered by{' '}
          <a 
            href="https://curatr.pro" 
            target="_blank" 
            rel="noopener noreferrer"
            className="hover:underline"
            style={{ color: textMuted }}
          >
            Curatr
          </a>
        </span>
      </div>
    </div>
  );
}
