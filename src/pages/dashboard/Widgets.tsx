import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Helmet } from "react-helmet-async";
import { Copy, Check, ExternalLink, Code2, Eye, Upload, X } from "lucide-react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { edgeErrorMessage } from "@/lib/edgeError";
import { LiveWidgetPreview } from "@/components/widget/LiveWidgetPreview";
import { WidgetContentChoice } from "@/components/widget/WidgetContentChoice";
import { WidgetStyleChoice } from "@/components/widget/WidgetStyleChoice";
import type { ResolvedWidgetContent, WidgetContent, WidgetStyle } from "@/lib/widgetContent";


const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1";
const WIDGET_SCRIPT_URL = "https://curatr.pro/widget.js";

interface WidgetConfig {
  feed: string;
  max: number;
  theme: "auto" | "light" | "dark";
  accent: string;
  width: string;
  customTitle: string;
  customAvatar: string;
  showSubscribe: boolean;
  frequency: "daily" | "weekly";
  sources: string[];
  featuredSources: string[];
  /** Days each featured source keeps its top slot, keyed by publication name */
  featuredDaysBySource: Record<string, number>;
  content: WidgetContent;
  style: WidgetStyle;
}

interface FeedSource {
  name: string;
  count: number;
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
    width: "responsive",
    customTitle: "",
    customAvatar: "",
    showSubscribe: false,
    frequency: "daily",
    sources: [],
    featuredSources: [],
    featuredDaysBySource: {},
    content: "auto",
    style: "list",
  });

  const [copied, setCopied] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarFileName, setAvatarFileName] = useState<string | null>(null);
  const [availableSources, setAvailableSources] = useState<FeedSource[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);


  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Set default feed when topics load
  useEffect(() => {
    if (topics && topics.length > 0 && !config.feed) {
      setConfig(prev => ({ ...prev, feed: topics[0]!.slug }));
    }
  }, [topics, config.feed]);

  // Load the publications that appear in the selected feed
  useEffect(() => {
    if (!config.feed) return;

    let cancelled = false;
    fetch(`${SUPABASE_URL}/widget-feed-data?feed=${config.feed}&mode=sources`)
      .then(res => res.json())
      .then(data => {
        if (cancelled) return;
        const list: FeedSource[] = data?.sources || [];
        setAvailableSources(list);
        // Default: every source included, none featured
        setConfig(prev => ({ ...prev, sources: list.map(s => s.name), featuredSources: [], content: "auto" }));
      })
      .catch(err => console.error("Source list fetch error:", err));

    return () => { cancelled = true; };
  }, [config.feed]);

  const sourcesParam = availableSources.length > 0 && config.sources.length < availableSources.length
    ? config.sources.join(",")
    : "";
  const featuredParam = config.featuredSources.join(",");
  // Days list aligned with the featured list order (per source)
  const featuredDaysParam = config.featuredSources
    .map(name => config.featuredDaysBySource[name] ?? 2)
    .join(",");

  const toggleSource = (name: string) => {
    setConfig(prev => {
      const included = prev.sources.includes(name);
      return {
        ...prev,
        sources: included ? prev.sources.filter(s => s !== name) : [...prev.sources, name],
        // Removing a source also drops it from the featured list
        featuredSources: included ? prev.featuredSources.filter(s => s !== name) : prev.featuredSources,
      };
    });
  };

  const toggleFeaturedSource = (name: string) => {
    setConfig(prev => ({
      ...prev,
      featuredSources: prev.featuredSources.includes(name)
        ? prev.featuredSources.filter(s => s !== name)
        : [...prev.featuredSources, name],
    }));
  };

  // Fetch preview data when feed changes
  useEffect(() => {
    if (!config.feed) return;

    setPreviewLoading(true);
    fetch(`${SUPABASE_URL}/widget-feed-data?feed=${config.feed}&max=1`)
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
  }, [config.feed]);

  // What the feed can show; "auto" lets the feed decide
  const autoContent: ResolvedWidgetContent =
    previewData?.content === "events" || previewData?.content === "both" ? previewData.content : "stories";
  const shownContent: ResolvedWidgetContent = config.content === "auto" ? autoContent : config.content;
  const canChooseContent = !!previewData?.available?.stories && !!previewData?.available?.events;

  const isValidAvatarUrl = (url: string) => {
    if (!url) return true;
    return url.startsWith("http://") || url.startsWith("https://");
  };

  const handleAvatarUpload = async (file: File) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Please upload a PNG, JPEG, or WebP image.");
      return;
    }
    if (file.size > 500 * 1024) {
      toast.error("Maximum file size is 500KB.");
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("feedSlug", config.feed || "custom");

      const { data: result, error: fnError } = await supabase.functions.invoke(
        "widget-avatar-upload",
        { body: formData }
      );
      if (fnError) throw new Error(await edgeErrorMessage(fnError, "Upload failed"));
      if (!result?.url) throw new Error(result?.error || "Upload failed");


      setConfig(prev => ({ ...prev, customAvatar: result.url }));
      setAvatarFileName(file.name);
      toast.success("Avatar uploaded");
    } catch (error) {
      console.error("Avatar upload error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to upload avatar.");
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleAvatarUpload(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleAvatarUpload(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const removeAvatar = () => {
    setConfig(prev => ({ ...prev, customAvatar: "" }));
    setAvatarFileName(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const getPreviewWidth = () => {
    if (config.width === "responsive" || config.width === "wide") return "100%";
    return config.width;
  };

  const getPreviewMaxWidth = () => {
    if (config.width === "responsive") return "480px";
    if (config.width === "wide") return "1000px";
    return config.width === "100%" ? "none" : config.width;
  };

  const generateEmbedCode = () => {
    const attrs = [`data-feed="${config.feed}"`];
    if (config.max !== 5) attrs.push(`data-max="${config.max}"`);
    if (config.theme !== "auto") attrs.push(`data-theme="${config.theme}"`);
    if (config.accent) attrs.push(`data-accent="${config.accent}"`);
    if (config.width !== "responsive") attrs.push(`data-width="${config.width}"`);
    if (config.customTitle) attrs.push(`data-title="${config.customTitle.replace(/"/g, "&quot;")}"`);
    if (config.customAvatar && isValidAvatarUrl(config.customAvatar)) {
      attrs.push(`data-avatar="${config.customAvatar.replace(/"/g, "&quot;")}"`);
    }
    if (config.showSubscribe) {
      attrs.push(`data-subscribe="true"`);
      if (config.frequency === "weekly") attrs.push(`data-frequency="weekly"`);
    }
    if (sourcesParam) attrs.push(`data-sources="${sourcesParam.replace(/"/g, "&quot;")}"`);
    if (featuredParam) {
      attrs.push(`data-featured="${featuredParam.replace(/"/g, "&quot;")}"`);
      attrs.push(`data-featured-days="${featuredDaysParam}"`);
    }
    if (config.content !== "auto") attrs.push(`data-content="${config.content}"`);
    if (config.style === "cards") attrs.push(`data-style="cards"`);



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

              <WidgetStyleChoice
                value={config.style}
                onChange={(v) => setConfig(prev => ({ ...prev, style: v }))}
              />

              {canChooseContent && (
                <WidgetContentChoice
                  value={shownContent}
                  onChange={(v) => setConfig(prev => ({ ...prev, content: v }))}
                />
              )}

              {/* Max Headlines */}
              <div className="space-y-3">
                <div className="flex justify-between">
                  <Label>{config.style === "cards" ? "Cards to show" : shownContent === "events" ? "Events to show" : "Headlines to show"}</Label>
                  <span className="text-sm text-muted-foreground">{config.max}</span>
                </div>
                <Slider
                  value={[config.max]}
                  onValueChange={([value]) => setConfig(prev => ({ ...prev, max: value ?? prev.max }))}
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
                <p className="text-sm text-muted-foreground">
                  Leave empty to use feed's brand color
                </p>
              </div>

              {/* Widget Title */}
              <div className="space-y-2">
                <Label htmlFor="widget-title">Widget title (optional)</Label>
                <Input
                  id="widget-title"
                  type="text"
                  maxLength={100}
                  placeholder={selectedTopic?.name || "Feed name"}
                  value={config.customTitle}
                  onChange={(e) => setConfig(prev => ({ ...prev, customTitle: e.target.value }))}
                />
                <p className="text-sm text-muted-foreground">
                  Leave blank to use the feed's name
                </p>
              </div>

              {/* Width */}
              <div className="space-y-2">
                <Label>Width</Label>
                <Select
                  value={config.width}
                  onValueChange={(value) => setConfig(prev => ({ ...prev, width: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wide">Wide (max 1000px) — with images</SelectItem>
                    <SelectItem value="responsive">Responsive (max 480px)</SelectItem>
                    <SelectItem value="100%">Full width</SelectItem>
                    <SelectItem value="400px">400px</SelectItem>
                    <SelectItem value="350px">350px</SelectItem>
                    <SelectItem value="300px">300px</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom logo / avatar */}
              <div className="space-y-2">
                <Label>Custom logo / icon (optional)</Label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {config.customAvatar && isValidAvatarUrl(config.customAvatar) ? (
                  <div className="flex items-center gap-3 p-3 border rounded-md bg-muted/50">
                    <img
                      src={config.customAvatar}
                      alt="Custom widget logo preview"
                      className="w-12 h-12 rounded-full object-cover border-2 border-background shadow-sm"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {avatarFileName || "Custom logo"}
                      </p>
                      <p className="text-sm text-muted-foreground">Click × to remove</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={removeAvatar}
                      aria-label="Remove custom logo"
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-md cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
                  >
                    {avatarUploading ? (
                      <>
                        <Loader2 className="w-8 h-8 text-muted-foreground animate-spin mb-2" />
                        <p className="text-sm text-muted-foreground">Uploading...</p>
                      </>
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-muted-foreground mb-2" />
                        <p className="text-sm font-medium">Upload image</p>
                        <p className="text-sm text-muted-foreground mt-1">or drag and drop</p>
                      </>
                    )}
                  </div>
                )}

                <p className="text-sm text-muted-foreground">
                  Ideal size: <strong>128×128px</strong> (square). Max 500KB. PNG, JPG, or WebP.
                </p>
              </div>

              {/* Subscribe box */}
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="subscribe">Show subscribe box</Label>
                  <p className="text-sm text-muted-foreground">
                    Readers can sign up for email highlights without leaving the page
                  </p>
                </div>
                <Switch
                  id="subscribe"
                  checked={config.showSubscribe}
                  onCheckedChange={(checked) => setConfig(prev => ({ ...prev, showSubscribe: checked }))}
                />
              </div>

              {/* Email frequency */}
              {config.showSubscribe && (
                <div className="space-y-2">
                  <Label htmlFor="frequency">Email frequency</Label>
                  <Select
                    value={config.frequency}
                    onValueChange={(value: "daily" | "weekly") => setConfig(prev => ({ ...prev, frequency: value }))}
                  >
                    <SelectTrigger id="frequency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily highlights</SelectItem>
                      <SelectItem value="weekly">Weekly briefing (includes what's on)</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    What new sign-ups from this embed will receive.
                  </p>
                </div>
              )}

              {/* Publications shown in this embed */}
              {availableSources.length > 1 && shownContent !== "events" && (
                <div className="space-y-3">
                  <div>
                    <Label>Publications</Label>
                    <p className="text-sm text-muted-foreground">
                      Choose which publications appear, and feature up to 3 at the top.
                    </p>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto rounded-md border p-3">
                    {availableSources.map(source => {
                      const included = config.sources.includes(source.name);
                      const featured = config.featuredSources.includes(source.name);
                      return (
                        <div key={source.name} className="flex items-center justify-between gap-3">
                          <label className="flex items-center gap-2 text-sm cursor-pointer">
                            <Checkbox
                              checked={included}
                              onCheckedChange={() => toggleSource(source.name)}
                              aria-label={`Show stories from ${source.name}`}
                            />
                            <span>{source.name}</span>
                            <span className="text-sm text-muted-foreground">({source.count})</span>
                          </label>
                          <div className="flex items-center gap-2">
                            <label className={`flex items-center gap-2 text-sm cursor-pointer ${included ? "" : "opacity-40 pointer-events-none"}`}>
                              <Checkbox
                                checked={featured}
                                disabled={!included}
                                onCheckedChange={() => toggleFeaturedSource(source.name)}
                                aria-label={`Feature ${source.name}`}
                              />
                              <span>Feature</span>
                            </label>
                            {featured && (
                              <Select
                                value={String(config.featuredDaysBySource[source.name] ?? 2)}
                                onValueChange={(v) =>
                                  setConfig(prev => ({
                                    ...prev,
                                    featuredDaysBySource: { ...prev.featuredDaysBySource, [source.name]: Number(v) },
                                  }))
                                }
                              >
                                <SelectTrigger className="h-11 w-[104px] text-sm" aria-label={`Keep ${source.name} featured for`}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {[1, 2, 3, 4, 5].map(d => (
                                    <SelectItem key={d} value={String(d)}>
                                      {d} {d === 1 ? "day" : "days"}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {config.sources.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Nothing selected — the embed will show every publication.
                    </p>
                  )}
                  {config.featuredSources.length > 0 && (
                    <p className="text-sm text-muted-foreground">
                      Each featured publication keeps its top slot for the days you choose, then its stories move down into the main list.
                    </p>
                  )}
                </div>
              )}


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
                    background: config.theme === "dark" ? "#0a0a0a" : "#f5f5f5"
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
                    <div
                      className="mx-auto transition-[max-width] duration-300"
                      style={{ width: getPreviewWidth(), maxWidth: getPreviewMaxWidth() }}
                    >
                      <LiveWidgetPreview
                        attrs={{
                          feed: config.feed,
                          max: String(config.max),
                          theme: config.theme === "auto" ? "light" : config.theme,
                          accent: config.accent,
                          width: config.width,
                          title: config.customTitle,
                          avatar: isValidAvatarUrl(config.customAvatar) ? config.customAvatar : "",
                          subscribe: config.showSubscribe ? "true" : "",
                          frequency: config.showSubscribe && config.frequency === "weekly" ? "weekly" : "",
                          sources: sourcesParam,
                          featured: featuredParam,
                          "featured-days": featuredParam ? featuredDaysParam : "",
                          content: config.content === "auto" ? "" : config.content,
                          style: config.style === "cards" ? "cards" : "",
                        }}
                      />
                    </div>
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
