import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Bot, Clock, Zap, Target, Play, Pause, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface GlobalAutomationSettingsData {
  id?: string;
  enabled: boolean;
  scrape_frequency_hours: number;
  auto_simplify_enabled: boolean;
  auto_simplify_quality_threshold: number;
}

interface AutomationStats {
  total_topics: number;
  active_topics: number;
  last_run_at?: string;
  next_run_at?: string;
  articles_gathered_24h: number;
  stories_generated_24h: number;
}

export const GlobalAutomationSettings = () => {
  const [settings, setSettings] = useState<GlobalAutomationSettingsData>({
    enabled: false,
    scrape_frequency_hours: 12,
    auto_simplify_enabled: true,
    auto_simplify_quality_threshold: 60
  });
  const [stats, setStats] = useState<AutomationStats>({
    total_topics: 0,
    active_topics: 0,
    articles_gathered_24h: 0,
    stories_generated_24h: 0
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadSettings();
    loadStats();
  }, []);

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('scheduler_settings')
        .select('*')
        .eq('setting_key', 'automation_config');

      if (data && data[0]) {
        const config = data[0].setting_value as any;
        setSettings({
          enabled: config?.enabled || false,
          scrape_frequency_hours: config?.scrape_frequency_hours || 12,
          auto_simplify_enabled: config?.auto_simplify_enabled || true,
          auto_simplify_quality_threshold: config?.auto_simplify_quality_threshold || 60
        });
      }
    } catch (error) {
      console.error('Error loading automation settings:', error);
      toast({
        title: "Error",
        description: "Failed to load automation settings",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      // Get topic counts
      const { data: topicsData, error: topicsError } = await supabase
        .from('topics')
        .select('id, is_active, topic_automation_settings(is_active)')
        .eq('is_active', true);

      if (topicsError) throw topicsError;

      const totalTopics = topicsData?.length || 0;
      const activeTopics = topicsData?.filter(t => 
        Array.isArray(t.topic_automation_settings) && t.topic_automation_settings.some(s => s.is_active)
      ).length || 0;

      // Get recent activity stats (simplified for now)
      setStats({
        total_topics: totalTopics,
        active_topics: activeTopics,
        articles_gathered_24h: 0, // TODO: Calculate from system_logs
        stories_generated_24h: 0  // TODO: Calculate from content_generation_queue
      });

    } catch (error) {
      console.error('Error loading automation stats:', error);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('scheduler_settings')
        .upsert({
          setting_key: 'automation_config',
          setting_value: {
            enabled: settings.enabled,
            scrape_frequency_hours: settings.scrape_frequency_hours,
            auto_simplify_enabled: settings.auto_simplify_enabled,
            auto_simplify_quality_threshold: settings.auto_simplify_quality_threshold
          }
        }, { 
          onConflict: 'setting_key'
        });

      if (error) throw error;

      toast({
        title: "Settings Saved",
        description: settings.enabled 
          ? "Automation service is now active" 
          : "Automation service has been paused"
      });

      loadStats();
    } catch (error) {
      console.error('Error saving automation settings:', error);
      toast({
        title: "Error",
        description: "Failed to save automation settings",
        variant: "destructive"
      });
    } finally {
      setSaving(false);
    }
  };

  const testAutomation = async () => {
    setTesting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('eezee-automation-service', {
        body: {
          userId: user.id,
          dryRun: true,
          forceRun: true
        }
      });

      if (error) throw error;

      const topicsCount = data.user_results?.[0]?.topicsToScrape?.length || 0;
      
      toast({
        title: "Automation Test Complete",
        description: `${topicsCount} topics would be processed in the next automation run`
      });

    } catch (error) {
      console.error('Error testing automation:', error);
      toast({
        title: "Test Failed",
        description: "Failed to test automation service",
        variant: "destructive"
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Main Automation Control */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="w-5 h-5" />
            eezee News Automation Service
            <Badge variant={settings.enabled ? "default" : "secondary"}>
              {settings.enabled ? "Active" : "Paused"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Master Switch */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="space-y-1">
              <Label className="text-base font-medium flex items-center gap-2">
                {settings.enabled ? <Play className="w-4 h-4 text-green-600" /> : <Pause className="w-4 h-4 text-gray-400" />}
                Global Automation
              </Label>
              <p className="text-sm text-muted-foreground">
                {settings.enabled 
                  ? "Automatically gathering articles and generating stories every 12 hours" 
                  : "All automation is currently paused"}
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(enabled) => setSettings(prev => ({ ...prev, enabled }))}
            />
          </div>

          {/* Frequency Settings */}
          <div className="space-y-4">
            <Label className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Scraping Frequency
            </Label>
            <Select 
              value={settings.scrape_frequency_hours.toString()} 
              onValueChange={(value) => setSettings(prev => ({ ...prev, scrape_frequency_hours: parseInt(value) }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="6">Every 6 hours</SelectItem>
                <SelectItem value="12">Every 12 hours (Recommended)</SelectItem>
                <SelectItem value="24">Once daily</SelectItem>
                <SelectItem value="48">Every 2 days</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Auto-Simplification Settings */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Auto-Simplification
              </Label>
              <Switch
                checked={settings.auto_simplify_enabled}
                onCheckedChange={(auto_simplify_enabled) => setSettings(prev => ({ ...prev, auto_simplify_enabled }))}
              />
            </div>
            
            {settings.auto_simplify_enabled && (
              <div className="space-y-3 p-4 border rounded-lg">
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Target className="w-4 h-4" />
                    Quality Threshold: {settings.auto_simplify_quality_threshold}%
                  </Label>
                  <Slider
                    value={[settings.auto_simplify_quality_threshold]}
                    onValueChange={([value]) => setSettings(prev => ({ ...prev, auto_simplify_quality_threshold: value }))}
                    max={100}
                    min={30}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Only articles with quality scores above this threshold will be automatically simplified
                  </p>
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button 
              onClick={handleSave} 
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Saving..." : "Save Settings"}
            </Button>
            <Button 
              variant="outline"
              onClick={testAutomation}
              disabled={testing || !settings.enabled}
              className="flex items-center gap-2"
            >
              <Settings className="w-4 h-4" />
              {testing ? "Testing..." : "Test Run"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Automation Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{stats.total_topics}</div>
              <div className="text-sm text-muted-foreground">Total Topics</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600">{stats.active_topics}</div>
              <div className="text-sm text-muted-foreground">Active Topics</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.articles_gathered_24h}</div>
              <div className="text-sm text-muted-foreground">Articles (24h)</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.stories_generated_24h}</div>
              <div className="text-sm text-muted-foreground">Stories (24h)</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};