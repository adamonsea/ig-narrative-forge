import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Bot, Clock, Zap, Sparkles, Moon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface TopicAutomationSettingsProps {
  topicId: string;
}

type AutomationMode = 'manual' | 'auto_gather' | 'auto_simplify' | 'auto_illustrate' | 'holiday';

interface AutomationSettings {
  automation_mode: AutomationMode;
  scrape_frequency_hours: number;
  quality_threshold: number;
  illustration_quality_threshold: number;
  auto_illustrate_in_holiday: boolean;
  is_active: boolean;
}

export function TopicAutomationSettings({ topicId }: TopicAutomationSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [automationMode, setAutomationMode] = useState<AutomationMode>('manual');
  const [scrapeFrequency, setScrapeFrequency] = useState(12);
  const [qualityThreshold, setQualityThreshold] = useState(60);
  const [illustrationThreshold, setIllustrationThreshold] = useState(70);
  const [autoIllustrateInHoliday, setAutoIllustrateInHoliday] = useState(true);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  
  const [originalSettings, setOriginalSettings] = useState<AutomationSettings | null>(null);

  useEffect(() => {
    loadSettings();
  }, [topicId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('topic_automation_settings')
        .select('*')
        .eq('topic_id', topicId)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        const mode = (data.automation_mode || 'manual') as AutomationMode;
        setAutomationMode(mode);
        setScrapeFrequency(data.scrape_frequency_hours || 12);
        setQualityThreshold(data.quality_threshold || 60);
        setIllustrationThreshold(data.illustration_quality_threshold || 70);
        setAutoIllustrateInHoliday(data.auto_illustrate_in_holiday ?? true);
        setNextRunAt(data.next_run_at);
        setOriginalSettings({
          automation_mode: mode,
          scrape_frequency_hours: data.scrape_frequency_hours,
          quality_threshold: data.quality_threshold,
          illustration_quality_threshold: data.illustration_quality_threshold,
          auto_illustrate_in_holiday: data.auto_illustrate_in_holiday ?? true,
          is_active: data.is_active,
        });
      }
    } catch (error) {
      console.error('Error loading automation settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to load automation settings',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const updates = {
          automation_mode: automationMode,
          scrape_frequency_hours: scrapeFrequency,
          quality_threshold: qualityThreshold,
          illustration_quality_threshold: illustrationThreshold,
          auto_illustrate_in_holiday: autoIllustrateInHoliday,
          is_active: automationMode !== 'manual',
          auto_simplify_enabled: automationMode === 'auto_simplify' || automationMode === 'holiday',
          auto_illustrate_enabled: automationMode === 'auto_illustrate' || (automationMode === 'holiday' && autoIllustrateInHoliday),
          next_run_at: automationMode !== 'manual' 
            ? new Date(Date.now() + scrapeFrequency * 60 * 60 * 1000).toISOString()
            : null,
          updated_at: new Date().toISOString(),
        };

      const { error } = await supabase
        .from('topic_automation_settings')
        .update(updates)
        .eq('topic_id', topicId);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Automation settings updated',
      });

      setOriginalSettings({ ...originalSettings, ...updates } as AutomationSettings);
    } catch (error) {
      console.error('Error saving automation settings:', error);
      toast({
        title: 'Error',
        description: 'Failed to save automation settings',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const hasChanges = originalSettings && (
    automationMode !== originalSettings.automation_mode ||
    scrapeFrequency !== originalSettings.scrape_frequency_hours ||
    qualityThreshold !== originalSettings.quality_threshold ||
    illustrationThreshold !== originalSettings.illustration_quality_threshold ||
    autoIllustrateInHoliday !== originalSettings.auto_illustrate_in_holiday
  );

  if (loading) {
    return <div className="text-muted-foreground">Loading automation settings...</div>;
  }

  const modeDescriptions = {
    manual: {
      icon: Clock,
      title: 'Manual',
      description: 'Review and approve everything yourself',
      credits: '0 credits/day',
      features: ['Manual article review', 'Manual story approval', 'Full editorial control'],
    },
    auto_gather: {
      icon: Zap,
      title: 'Auto-Gather',
      description: 'Scrape articles automatically, review manually',
      credits: '0 credits/day',
      features: [`Articles scraped every ${scrapeFrequency} hours`, 'Manual story approval', 'Manual illustration'],
    },
    auto_simplify: {
      icon: Sparkles,
      title: 'Auto-Simplify',
      description: 'Auto-generate stories for high-quality articles',
      credits: '~2-5 credits/day',
      features: ['Manual article gathering', 'Auto story generation', 'Manual illustration'],
    },
    auto_illustrate: {
      icon: Bot,
      title: 'Auto-Illustrate',
      description: 'Auto-generate images for high-scoring stories',
      credits: '~3-5 credits/day',
      features: ['Manual article gathering', 'Manual story approval', 'Auto illustration generation'],
    },
    holiday: {
      icon: Moon,
      title: 'Holiday Mode',
      description: 'Full automation - gather, simplify, and illustrate',
      credits: '~12-20 credits/day',
      features: [
        `Auto-scrape every ${scrapeFrequency} hours`,
        'Auto story generation',
        'Auto illustration (optional)',
        'Minimal manual intervention',
      ],
    },
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="w-5 h-5" />
          Automation Settings
          {automationMode === 'holiday' && (
            <Badge variant="secondary" className="ml-2">
              <Moon className="w-3 h-3 mr-1" />
              Holiday Mode Active
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Configure how much automation you want for this topic
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <RadioGroup value={automationMode} onValueChange={(value) => setAutomationMode(value as AutomationMode)}>
          {(Object.keys(modeDescriptions) as AutomationMode[]).map((mode) => {
            const config = modeDescriptions[mode];
            const Icon = config.icon;
            return (
              <div
                key={mode}
                className={`flex items-start space-x-3 p-4 border rounded-lg cursor-pointer transition-colors ${
                  automationMode === mode ? 'border-primary bg-primary/5' : 'hover:border-muted-foreground/50'
                }`}
                onClick={() => setAutomationMode(mode)}
              >
                <RadioGroupItem value={mode} id={mode} />
                <div className="flex-1 space-y-1">
                  <Label htmlFor={mode} className="flex items-center gap-2 cursor-pointer">
                    <Icon className="w-4 h-4" />
                    {config.title}
                    <Badge variant="outline" className="ml-auto">
                      {config.credits}
                    </Badge>
                  </Label>
                  <p className="text-sm text-muted-foreground">{config.description}</p>
                  <ul className="text-xs text-muted-foreground space-y-1 mt-2">
                    {config.features.map((feature, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="text-primary">•</span> {feature}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </RadioGroup>

        {/* Conditional Settings */}
        {(automationMode === 'auto_gather' || automationMode === 'holiday') && (
          <div className="space-y-2 p-4 border rounded-lg">
            <Label>Scrape Frequency: Every {scrapeFrequency} hours</Label>
            <Slider
              value={[scrapeFrequency]}
              onValueChange={([value]) => setScrapeFrequency(value)}
              min={6}
              max={24}
              step={6}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              How often to automatically check sources for new articles
            </p>
          </div>
        )}

        {(automationMode === 'auto_simplify' || automationMode === 'holiday') && (
          <div className="space-y-2 p-4 border rounded-lg">
            <Label>Story Generation Threshold: {qualityThreshold}%</Label>
            <Slider
              value={[qualityThreshold]}
              onValueChange={([value]) => setQualityThreshold(value)}
              min={30}
              max={100}
              step={5}
              className="w-full"
            />
            <p className="text-xs text-muted-foreground">
              Only articles with quality scores above this threshold will be automatically converted to stories
            </p>
          </div>
        )}

        {(automationMode === 'auto_illustrate' || automationMode === 'holiday') && (
          <div className="space-y-4 p-4 border rounded-lg">
            {automationMode === 'holiday' && (
              <div className="flex items-center justify-between pb-4 border-b">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-illustrate-holiday">Auto-Illustrate in Holiday Mode</Label>
                  <p className="text-xs text-muted-foreground">
                    Generate illustrations automatically while in holiday mode
                  </p>
                </div>
                <Switch
                  id="auto-illustrate-holiday"
                  checked={autoIllustrateInHoliday}
                  onCheckedChange={setAutoIllustrateInHoliday}
                />
              </div>
            )}
            
            {(automationMode === 'auto_illustrate' || (automationMode === 'holiday' && autoIllustrateInHoliday)) && (
              <div className="space-y-2">
                <Label>Illustration Generation Threshold: {illustrationThreshold}%</Label>
                <Slider
                  value={[illustrationThreshold]}
                  onValueChange={([value]) => setIllustrationThreshold(value)}
                  min={50}
                  max={100}
                  step={5}
                  className="w-full"
                />
                <p className="text-xs text-muted-foreground">
                  Stories with quality scores above this threshold will automatically get illustrations
                </p>
              </div>
            )}
          </div>
        )}

        {automationMode !== 'manual' && nextRunAt && (
          <div className="p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Next Automation Run</span>
              </div>
              <Badge variant="outline" className="font-mono">
                {new Date(nextRunAt) > new Date() 
                  ? `In ${Math.round((new Date(nextRunAt).getTime() - Date.now()) / (1000 * 60 * 60))}h ${Math.round(((new Date(nextRunAt).getTime() - Date.now()) % (1000 * 60 * 60)) / (1000 * 60))}m`
                  : 'Overdue'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {new Date(nextRunAt).toLocaleString()}
            </p>
          </div>
        )}

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? 'Saving...' : 'Save Automation Settings'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}