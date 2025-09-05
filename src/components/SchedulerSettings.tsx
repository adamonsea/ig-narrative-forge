import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Clock, Calendar, Globe, RefreshCw } from 'lucide-react';

interface SchedulerConfig {
  frequency_hours: number;
  timezone: string;
  overnight_hour: number;
  enabled: boolean;
  last_updated?: string;
  [key: string]: any; // Make it compatible with Json
}

interface SchedulerSettings {
  scraper_schedule: SchedulerConfig;
  cleanup_schedule: SchedulerConfig;
}

const timezones = [
  'UTC',
  'America/New_York',
  'America/Chicago', 
  'America/Denver',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'Europe/Berlin',
  'Asia/Tokyo',
  'Asia/Hong_Kong',
  'Australia/Sydney'
];

export const SchedulerSettings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SchedulerSettings>({
    scraper_schedule: {
      frequency_hours: 24,
      timezone: 'UTC',
      overnight_hour: 2,
      enabled: true
    },
    cleanup_schedule: {
      frequency_hours: 24,
      timezone: 'UTC',
      overnight_hour: 3,
      enabled: true
    }
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  // Auto-detect user timezone
  useEffect(() => {
    const userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (timezones.includes(userTimezone)) {
      setSettings(prev => ({
        scraper_schedule: { ...prev.scraper_schedule, timezone: userTimezone },
        cleanup_schedule: { ...prev.cleanup_schedule, timezone: userTimezone }
      }));
    }
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('scheduler_settings')
        .select('*')
        .in('setting_key', ['scraper_schedule', 'cleanup_schedule']);

      if (error) throw error;

      if (data) {
        const newSettings = { ...settings };
        data.forEach(setting => {
          if (setting.setting_key === 'scraper_schedule' || setting.setting_key === 'cleanup_schedule') {
            newSettings[setting.setting_key as keyof SchedulerSettings] = setting.setting_value as SchedulerConfig;
          }
        });
        setSettings(newSettings);
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to load scheduler settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      // Update both settings
      const { error: scraperError } = await supabase.rpc('update_scheduler_setting', {
        p_setting_key: 'scraper_schedule',
        p_setting_value: settings.scraper_schedule as any
      });

      if (scraperError) throw scraperError;

      const { error: cleanupError } = await supabase.rpc('update_scheduler_setting', {
        p_setting_key: 'cleanup_schedule', 
        p_setting_value: settings.cleanup_schedule as any
      });

      if (cleanupError) throw cleanupError;

      toast({
        title: 'Success',
        description: 'Scheduler settings updated successfully. Cron jobs will be rescheduled automatically.',
      });

      // Reload to get updated timestamps
      await loadSettings();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to save scheduler settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updateScraperSetting = (key: keyof SchedulerConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      scraper_schedule: { ...prev.scraper_schedule, [key]: value }
    }));
  };

  const updateCleanupSetting = (key: keyof SchedulerConfig, value: any) => {
    setSettings(prev => ({
      ...prev,
      cleanup_schedule: { ...prev.cleanup_schedule, [key]: value }
    }));
  };

  const getNextRunTime = (config: SchedulerConfig) => {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(config.overnight_hour, 0, 0, 0);
    
    return tomorrow.toLocaleString('en-US', {
      timeZone: config.timezone,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });
  };

  useEffect(() => {
    loadSettings();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading scheduler settings...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Scheduler Settings</h2>
          <p className="text-muted-foreground">Configure automated scraping and cleanup schedules</p>
        </div>
        <Button onClick={saveSettings} disabled={saving}>
          {saving ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>

      {/* Scraper Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Content Scraper Schedule
          </CardTitle>
          <CardDescription>
            Configure when the automated content scraper runs to collect articles from your sources
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="scraper-enabled"
              checked={settings.scraper_schedule.enabled}
              onCheckedChange={(checked) => updateScraperSetting('enabled', checked)}
            />
            <Label htmlFor="scraper-enabled">Enable automated scraping</Label>
          </div>

          {settings.scraper_schedule.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="scraper-timezone">Timezone</Label>
                <Select 
                  value={settings.scraper_schedule.timezone}
                  onValueChange={(value) => updateScraperSetting('timezone', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="scraper-hour">Overnight Hour (24h format)</Label>
                <Input
                  id="scraper-hour"
                  type="number"
                  min="0"
                  max="23"
                  value={settings.scraper_schedule.overnight_hour}
                  onChange={(e) => updateScraperSetting('overnight_hour', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select 
                  value={settings.scraper_schedule.frequency_hours.toString()}
                  onValueChange={(value) => updateScraperSetting('frequency_hours', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">Every 12 hours</SelectItem>
                    <SelectItem value="24">Daily</SelectItem>
                    <SelectItem value="48">Every 2 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {settings.scraper_schedule.enabled && (
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <strong>Next run:</strong> {getNextRunTime(settings.scraper_schedule)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cleanup Schedule */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="w-5 h-5" />
            Database Cleanup Schedule
          </CardTitle>
          <CardDescription>
            Configure when old logs, rate limits, and temporary data are cleaned up
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="cleanup-enabled"
              checked={settings.cleanup_schedule.enabled}
              onCheckedChange={(checked) => updateCleanupSetting('enabled', checked)}
            />
            <Label htmlFor="cleanup-enabled">Enable automated cleanup</Label>
          </div>

          {settings.cleanup_schedule.enabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="cleanup-timezone">Timezone</Label>
                <Select 
                  value={settings.cleanup_schedule.timezone}
                  onValueChange={(value) => updateCleanupSetting('timezone', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {timezones.map(tz => (
                      <SelectItem key={tz} value={tz}>{tz}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cleanup-hour">Overnight Hour (24h format)</Label>
                <Input
                  id="cleanup-hour"
                  type="number"
                  min="0"
                  max="23"
                  value={settings.cleanup_schedule.overnight_hour}
                  onChange={(e) => updateCleanupSetting('overnight_hour', parseInt(e.target.value))}
                />
              </div>

              <div className="space-y-2">
                <Label>Frequency</Label>
                <Select 
                  value={settings.cleanup_schedule.frequency_hours.toString()}
                  onValueChange={(value) => updateCleanupSetting('frequency_hours', parseInt(value))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="24">Daily</SelectItem>
                    <SelectItem value="48">Every 2 days</SelectItem>
                    <SelectItem value="72">Every 3 days</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {settings.cleanup_schedule.enabled && (
            <div className="bg-muted p-3 rounded-md">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <strong>Next run:</strong> {getNextRunTime(settings.cleanup_schedule)}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Schedule Information</CardTitle>
          <CardDescription>
            Current scheduler status and configuration details
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <p><strong>Scraper Status:</strong> {settings.scraper_schedule.enabled ? '✅ Active' : '❌ Disabled'}</p>
            <p><strong>Cleanup Status:</strong> {settings.cleanup_schedule.enabled ? '✅ Active' : '❌ Disabled'}</p>
            <p><strong>Time Management:</strong> Schedules are automatically adjusted for your timezone</p>
            <p><strong>Overnight Execution:</strong> Jobs run during specified overnight hours to minimize load</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};