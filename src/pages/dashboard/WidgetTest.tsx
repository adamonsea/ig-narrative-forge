import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { useAuth } from "@/hooks/useAuth";
import { useTopics } from "@/hooks/useTopics";
import { AppLayout } from "@/components/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Loader2, Eye, TestTube2 } from "lucide-react";

const SUPABASE_URL = "https://fpoywkjgdapgjtdeooak.supabase.co/functions/v1";

interface WidgetData {
  feed?: {
    name: string;
    logo_url?: string;
    brand_color?: string;
  };
  stories?: Array<{
    id: string;
    title: string;
    published_at: string;
  }>;
  error?: string;
}

export default function WidgetTest() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { data: topics, isLoading: topicsLoading } = useTopics();

  const [selectedFeed, setSelectedFeed] = useState("");
  const [widgetData, setWidgetData] = useState<WidgetData | null>(null);
  const [loading, setLoading] = useState(false);

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth");
    }
  }, [user, authLoading, navigate]);

  // Set default feed when topics load
  useEffect(() => {
    if (topics && topics.length > 0 && !selectedFeed) {
      setSelectedFeed(topics[0].slug);
    }
  }, [topics, selectedFeed]);

  // Fetch widget data
  useEffect(() => {
    if (!selectedFeed) return;

    setLoading(true);
    fetch(`${SUPABASE_URL}/widget-feed-data?feed=${selectedFeed}&max=5`)
      .then(res => res.json())
      .then(data => setWidgetData(data))
      .catch(err => {
        console.error("Widget data fetch error:", err);
        setWidgetData({ error: err.message });
      })
      .finally(() => setLoading(false));
  }, [selectedFeed]);

  if (authLoading || topicsLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  const accentColor = widgetData?.feed?.brand_color || "#3b82f6";

  // State variations for testing
  const states = {
    loading: { type: "loading", label: "Loading" },
    empty: { type: "empty", label: "Empty (No Stories)" },
    error: { type: "error", label: "Error State" },
    minimal: { type: "minimal", label: "1 Story" },
    standard: { type: "standard", label: "5 Stories" },
    full: { type: "full", label: "10 Stories" },
  };

  return (
    <AppLayout>
      <Helmet>
        <title>Widget Test Lab | Curatr</title>
      </Helmet>

      <div className="container max-w-7xl py-8 space-y-8">
        <div className="flex items-center gap-3">
          <TestTube2 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Widget Test Lab</h1>
            <p className="text-muted-foreground">
              Test widgets in various states and themes
            </p>
          </div>
        </div>

        {/* Feed Selector */}
        <Card>
          <CardHeader>
            <CardTitle>Test Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-xs">
              <Label htmlFor="feed">Select Feed</Label>
              <Select value={selectedFeed} onValueChange={setSelectedFeed}>
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
          </CardContent>
        </Card>

        {/* Theme Comparison */}
        <Tabs defaultValue="themes">
          <TabsList>
            <TabsTrigger value="themes">Theme Comparison</TabsTrigger>
            <TabsTrigger value="states">State Variations</TabsTrigger>
            <TabsTrigger value="embed">Embed Preview</TabsTrigger>
          </TabsList>

          {/* Themes Tab */}
          <TabsContent value="themes" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Light Theme */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Light Theme</CardTitle>
                    <Badge variant="outline">theme="light"</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={widgetData} 
                      theme="light" 
                      accent={accentColor}
                      loading={loading}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Dark Theme */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Dark Theme</CardTitle>
                    <Badge variant="outline">theme="dark"</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-900 rounded-lg p-4">
                    <WidgetPreview 
                      data={widgetData} 
                      theme="dark" 
                      accent={accentColor}
                      loading={loading}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Accent Color Variations */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Custom Accent</CardTitle>
                    <Badge variant="outline">#10b981</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={widgetData} 
                      theme="light" 
                      accent="#10b981"
                      loading={loading}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* States Tab */}
          <TabsContent value="states" className="space-y-4">
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Loading State */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Loading</CardTitle>
                    <Badge>Skeleton</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={null} 
                      theme="light" 
                      accent={accentColor}
                      loading={true}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Error State */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Error</CardTitle>
                    <Badge variant="destructive">Error</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={{ error: "Failed to load feed data" }} 
                      theme="light" 
                      accent={accentColor}
                      loading={false}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Empty State */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Empty</CardTitle>
                    <Badge variant="secondary">No Stories</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={{ feed: widgetData?.feed, stories: [] }} 
                      theme="light" 
                      accent={accentColor}
                      loading={false}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Single Story */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Single Story</CardTitle>
                    <Badge variant="secondary">1 item</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={{ 
                        feed: widgetData?.feed, 
                        stories: widgetData?.stories?.slice(0, 1) || [] 
                      }} 
                      theme="light" 
                      accent={accentColor}
                      loading={false}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Live Data */}
              <Card className="md:col-span-2">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Live Data</CardTitle>
                    <Badge variant="default">{widgetData?.stories?.length || 0} stories</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-gray-100 rounded-lg p-4">
                    <WidgetPreview 
                      data={widgetData} 
                      theme="light" 
                      accent={accentColor}
                      loading={loading}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Embed Preview Tab */}
          <TabsContent value="embed" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5" />
                  Real-World Embed Simulation
                </CardTitle>
                <CardDescription>
                  How the widget appears embedded in different website contexts
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Light Website Simulation */}
                <div className="space-y-2">
                  <Label>Light Website Context</Label>
                  <div 
                    className="rounded-lg p-8"
                    style={{ 
                      background: "#f9fafb",
                      fontFamily: "Georgia, serif"
                    }}
                  >
                    <div className="max-w-2xl mx-auto space-y-6">
                      <h2 style={{ fontSize: "28px", fontWeight: "bold", color: "#111" }}>
                        Welcome to Our News Site
                      </h2>
                      <p style={{ color: "#666", lineHeight: 1.8 }}>
                        Stay updated with the latest local news and community stories. 
                        Below you'll find our curated headlines widget.
                      </p>
                      <div className="max-w-sm">
                        <WidgetPreview 
                          data={widgetData} 
                          theme="light" 
                          accent={accentColor}
                          loading={loading}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dark Website Simulation */}
                <div className="space-y-2">
                  <Label>Dark Website Context</Label>
                  <div 
                    className="rounded-lg p-8"
                    style={{ 
                      background: "#0a0a0a",
                      fontFamily: "-apple-system, sans-serif"
                    }}
                  >
                    <div className="max-w-2xl mx-auto space-y-6">
                      <h2 style={{ fontSize: "24px", fontWeight: 600, color: "#fff" }}>
                        Tech Blog Dashboard
                      </h2>
                      <p style={{ color: "#888", lineHeight: 1.6, fontSize: "14px" }}>
                        Your personalized news feed. Embedded widget below.
                      </p>
                      <div className="max-w-sm">
                        <WidgetPreview 
                          data={widgetData} 
                          theme="dark" 
                          accent={accentColor}
                          loading={loading}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}

// Widget Preview Component
function WidgetPreview({ 
  data, 
  theme, 
  accent,
  loading
}: { 
  data: WidgetData | null; 
  theme: "light" | "dark"; 
  accent: string;
  loading: boolean;
}) {
  const isDark = theme === "dark";
  const bg = isDark ? "#1a1a1a" : "#ffffff";
  const text = isDark ? "#e5e5e5" : "#1a1a1a";
  const textMuted = isDark ? "#a0a0a0" : "#6b7280";
  const border = isDark ? "#333333" : "#e5e7eb";

  // Loading state
  if (loading) {
    return (
      <div 
        className="rounded-xl p-4 animate-pulse"
        style={{ background: bg, border: `1px solid ${border}` }}
      >
        <div className="flex items-center gap-2.5 pb-3 mb-3" style={{ borderBottom: `1px solid ${border}` }}>
          <div className="w-7 h-7 rounded-md" style={{ background: border }} />
          <div className="h-4 w-24 rounded" style={{ background: border }} />
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: border }} />
              <div className="h-3 flex-1 rounded" style={{ background: border }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (data?.error) {
    return (
      <div 
        className="rounded-xl p-4"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
      >
        <div className="text-center py-4">
          <p className="text-sm" style={{ color: textMuted }}>Unable to load feed</p>
          <p className="text-xs mt-1" style={{ color: isDark ? "#ef4444" : "#dc2626" }}>
            {data.error}
          </p>
        </div>
      </div>
    );
  }

  // Empty state
  if (!data?.stories || data.stories.length === 0) {
    return (
      <div 
        className="rounded-xl p-4"
        style={{ background: bg, border: `1px solid ${border}`, color: text }}
      >
        {data?.feed && (
          <div className="flex items-center gap-2.5 pb-3 mb-3" style={{ borderBottom: `1px solid ${border}` }}>
            <div 
              className="w-7 h-7 rounded-md flex items-center justify-center text-white font-semibold text-sm"
              style={{ background: accent }}
            >
              {data.feed.name?.charAt(0) || "?"}
            </div>
            <span className="font-semibold">{data.feed.name}</span>
          </div>
        )}
        <div className="text-center py-6">
          <p className="text-sm" style={{ color: textMuted }}>No stories available</p>
        </div>
      </div>
    );
  }

  // Normal state
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
        {data.feed?.logo_url ? (
          <img 
            src={data.feed.logo_url} 
            alt={data.feed.name}
            className="w-7 h-7 rounded-md object-cover"
          />
        ) : (
          <div 
            className="w-7 h-7 rounded-md flex items-center justify-center text-white font-semibold text-sm"
            style={{ background: accent }}
          >
            {data.feed?.name?.charAt(0) || "?"}
          </div>
        )}
        <span className="font-semibold">{data.feed?.name}</span>
      </div>

      {/* Stories */}
      <div className="space-y-1">
        {data.stories.map((story, idx) => (
          <div 
            key={idx}
            className="flex items-start gap-2.5 p-2 rounded-lg cursor-pointer"
            style={{ marginLeft: "-8px", marginRight: "-8px" }}
          >
            <div 
              className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0"
              style={{ background: accent }}
            />
            <span className="font-medium line-clamp-2">{story.title}</span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div 
        className="flex justify-between items-center pt-3 mt-3 flex-wrap gap-2"
        style={{ borderTop: `1px solid ${border}` }}
      >
        <span 
          className="font-medium text-sm"
          style={{ color: accent }}
        >
          View all stories →
        </span>
        <span className="text-xs" style={{ color: textMuted }}>
          Powered by Curatr
        </span>
      </div>
    </div>
  );
}
