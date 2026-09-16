import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Check, Clock, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TopicAutomationSettingsProps {
  topicId: string;
  onModeChange?: (mode: AutomationMode) => void;
}

type AutomationMode = 'manual' | 'auto_gather' | 'auto_simplify' | 'auto_illustrate' | 'holiday';

const MODE_LABELS: Record<AutomationMode, string> = {
  manual: 'Manual',
  auto_gather: 'Auto-Gather',
  auto_simplify: 'Auto-Simplify',
  auto_illustrate: 'Auto-Illustrate',
  holiday: 'Holiday Mode',
};

const MODE_DESCRIPTIONS: Record<AutomationMode, string> = {
  manual: 'Nothing is gathered or published without you starting it.',
  auto_gather: 'Curatr gathers new articles; every publishing decision remains yours.',
  auto_simplify: 'Strong stories are prepared automatically and held for your review.',
  auto_illustrate: 'High-scoring prepared stories receive artwork automatically.',
  holiday: 'Curatr gathers, prepares, illustrates and publishes qualifying stories.',
};

const MODE_GROUPS: { label: string; modes: AutomationMode[]; summary: string }[] = [
  { label: 'Hands-on', modes: ['manual'], summary: 'You make every decision' },
  { label: 'Assisted', modes: ['auto_gather', 'auto_simplify', 'auto_illustrate'], summary: 'Curatr prepares; you stay in control' },
  { label: 'Automatic', modes: ['holiday'], summary: 'Qualifying stories can publish unattended' },
];

export function TopicAutomationSettings({ topicId, onModeChange }: TopicAutomationSettingsProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [automationMode, setAutomationMode] = useState<AutomationMode>('manual');
  const [scrapeFrequency, setScrapeFrequency] = useState(12);
  const [qualityThreshold, setQualityThreshold] = useState(60);
  const [illustrationThreshold, setIllustrationThreshold] = useState(70);
  const [autoIllustrateInHoliday, setAutoIllustrateInHoliday] = useState(true);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const loadedRef = useRef(false);

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
        setAutomationMode((data.automation_mode || 'manual') as AutomationMode);
        onModeChange?.((data.automation_mode || 'manual') as AutomationMode);
        setScrapeFrequency(data.scrape_frequency_hours || 12);
        setQualityThreshold(data.quality_threshold || 60);
        setIllustrationThreshold(data.illustration_quality_threshold || 70);
        setAutoIllustrateInHoliday(data.auto_illustrate_in_holiday ?? true);
        setNextRunAt(data.next_run_at);
      }
    } catch (error) {
      console.error('Error loading automation settings:', error);
    } finally {
      setLoading(false);
      // Mark as loaded after a tick to avoid auto-save on initial load
      setTimeout(() => { loadedRef.current = true; }, 100);
    }
  };

  const saveSettings = useCallback(async (updates: Record<string, any>) => {
    if (!loadedRef.current) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('topic_automation_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('topic_id', topicId);

      if (error) throw error;
      toast({ title: 'Saved' });
    } catch (error) {
      console.error('Error saving automation settings:', error);
      toast({ title: 'Error', description: 'Failed to save', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }, [topicId, toast]);

  // Auto-save mode changes immediately
  const handleModeChange = (mode: AutomationMode) => {
    setAutomationMode(mode);
    onModeChange?.(mode);
    const nextRun = mode !== 'manual'
      ? new Date(Date.now() + scrapeFrequency * 60 * 60 * 1000).toISOString()
      : null;
    setNextRunAt(nextRun);
    saveSettings({
      automation_mode: mode,
      is_active: mode !== 'manual',
      auto_simplify_enabled: mode === 'auto_simplify' || mode === 'holiday',
      auto_illustrate_enabled: mode === 'auto_illustrate' || (mode === 'holiday' && autoIllustrateInHoliday),
      next_run_at: nextRun,
    });
  };

  // Debounced auto-save for sliders
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedSave = useCallback((updates: Record<string, any>) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => saveSettings(updates), 500);
  }, [saveSettings]);

  const handleScrapeFrequency = (value: number) => {
    setScrapeFrequency(value);
    debouncedSave({
      scrape_frequency_hours: value,
      next_run_at: automationMode !== 'manual'
        ? new Date(Date.now() + value * 60 * 60 * 1000).toISOString()
        : null,
    });
  };

  const handleQualityThreshold = (value: number) => {
    setQualityThreshold(value);
    debouncedSave({ quality_threshold: value });
  };

  const handleIllustrationThreshold = (value: number) => {
    setIllustrationThreshold(value);
    debouncedSave({ illustration_quality_threshold: value });
  };

  const handleAutoIllustrateToggle = (checked: boolean) => {
    setAutoIllustrateInHoliday(checked);
    saveSettings({
      auto_illustrate_in_holiday: checked,
      auto_illustrate_enabled: automationMode === 'auto_illustrate' || (automationMode === 'holiday' && checked),
    });
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div><Label className="text-sm">Level of control</Label><p className="mt-1 text-xs text-muted-foreground">Choose the closest starting point, then refine it below.</p></div>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">{saving && <Loader2 className="h-3 w-3 animate-spin" />}{saving ? 'Saving' : 'Saved'}</span>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {MODE_GROUPS.map((group) => {
          const active = group.modes.includes(automationMode);
          const targetMode = group.modes[0];
          return (
            <Button key={group.label} type="button" variant="outline" onClick={() => handleModeChange(targetMode)} aria-pressed={active} className={`h-auto min-h-20 flex-col items-start justify-start whitespace-normal rounded-md p-3 text-left ${active ? 'border-primary bg-primary/5' : 'hover:border-primary/40'}`}>
              <span className="flex items-center gap-2 text-sm font-medium">{active && <Check className="h-4 w-4 text-primary" />}{group.label}</span>
              <span className="mt-1 block text-xs text-muted-foreground">{group.summary}</span>
            </Button>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-4 border-y border-border py-3">
        <div><p className="text-sm font-medium">Current behaviour</p><p className="mt-0.5 text-xs text-muted-foreground">{MODE_DESCRIPTIONS[automationMode]}</p></div>
        <Select value={automationMode} onValueChange={(v) => handleModeChange(v as AutomationMode)}>
          <SelectTrigger className="w-[160px] shrink-0 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(MODE_LABELS) as AutomationMode[]).map((mode) => <SelectItem key={mode} value={mode}>{MODE_LABELS[mode]}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {/* Conditional sliders */}
      {(automationMode === 'auto_gather' || automationMode === 'holiday') && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Scrape frequency</Label>
            <span className="text-xs text-muted-foreground">{scrapeFrequency}h</span>
          </div>
          <Slider
            value={[scrapeFrequency]}
            onValueChange={([v]) => handleScrapeFrequency(v)}
            min={4} max={24} step={4}
          />
        </div>
      )}

      {(automationMode === 'auto_simplify' || automationMode === 'holiday') && (
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm">Story threshold</Label>
            <span className="text-xs text-muted-foreground">{qualityThreshold}%</span>
          </div>
          <Slider
            value={[qualityThreshold]}
            onValueChange={([v]) => handleQualityThreshold(v)}
            min={30} max={100} step={5}
          />
        </div>
      )}

      {(automationMode === 'auto_illustrate' || automationMode === 'holiday') && (
        <div className="space-y-3 pt-2">
          {automationMode === 'holiday' && (
            <div className="flex items-center justify-between">
              <Label className="text-sm">Auto-illustrate</Label>
              <Switch checked={autoIllustrateInHoliday} onCheckedChange={handleAutoIllustrateToggle} />
            </div>
          )}
          {(automationMode === 'auto_illustrate' || (automationMode === 'holiday' && autoIllustrateInHoliday)) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Illustration threshold</Label>
                <span className="text-xs text-muted-foreground">{illustrationThreshold}%</span>
              </div>
              <Slider
                value={[illustrationThreshold]}
                onValueChange={([v]) => handleIllustrationThreshold(v)}
                min={50} max={100} step={5}
              />
            </div>
          )}
        </div>
      )}

      {automationMode !== 'manual' && nextRunAt && (
        <div className="flex items-center gap-2 pt-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>
            Next run: {new Date(nextRunAt) > new Date()
              ? `in ${Math.round((new Date(nextRunAt).getTime() - Date.now()) / (1000 * 60 * 60))}h`
              : 'overdue'}
          </span>
        </div>
      )}
    </div>
  );
}
