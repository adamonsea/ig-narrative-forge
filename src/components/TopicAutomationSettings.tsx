import { SettingRow } from "@/components/settings/SettingRow";
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Disclosure, InfoHint, SaveIndicator, type SaveState } from '@/components/ui/editorial';
import { Check, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface TopicAutomationSettingsProps {
  topicId: string;
  onModeChange?: (mode: AutomationMode) => void;
}

type AutomationMode = 'manual' | 'auto_gather' | 'auto_simplify' | 'auto_illustrate' | 'holiday';

const MODE_LABELS: Record<AutomationMode, string> = {
  manual: 'Hands-on',
  auto_gather: 'Collect only',
  auto_simplify: 'Collect and write',
  auto_illustrate: 'Collect, write and illustrate',
  holiday: 'Autopilot',
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
  const [saveState, setSaveState] = useState<SaveState>(null);

  const [automationMode, setAutomationMode] = useState<AutomationMode>('manual');
  const [scrapeFrequency, setScrapeFrequency] = useState(12);
  const [qualityThreshold, setQualityThreshold] = useState(60);
  const [illustrationThreshold, setIllustrationThreshold] = useState(70);
  const [autoIllustrateInHoliday, setAutoIllustrateInHoliday] = useState(true);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const loadedRef = useRef(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaveState('saving');
    try {
      const { error } = await supabase
        .from('topic_automation_settings')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('topic_id', topicId);

      if (error) throw error;
      setSaveState('saved');
      savedTimerRef.current = setTimeout(() => setSaveState(null), 2500);
    } catch (error) {
      console.error('Error saving automation settings:', error);
      setSaveState(null);
      toast({ title: 'Not saved', description: 'Your automation settings could not be saved. Try again.', variant: 'destructive' });
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
    return <div className="h-32 w-full animate-pulse rounded-xl bg-muted" />;
  }

  return (
    <div className="divide-y divide-border border-y border-border">
      <SettingRow label="Level of control" hint={automationMode !== 'manual' && nextRunAt ? `Next run ${new Date(nextRunAt) > new Date() ? `in ${Math.round((new Date(nextRunAt).getTime() - Date.now()) / (1000 * 60 * 60))}h` : 'overdue'}.` : "How much Curatr does for you."} stack>
        <div className="space-y-3">
          <div className="flex justify-end"><SaveIndicator state={saveState} /></div>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODE_GROUPS.map((group) => {
              const active = group.modes.includes(automationMode);
              const targetMode = group.modes[0];
              return (
                <Button key={group.label} type="button" variant="outline" onClick={() => handleModeChange(targetMode!)} aria-pressed={active} className={`h-auto min-h-14 items-center justify-start whitespace-normal rounded-lg p-3 text-left text-base transition-colors ${active ? 'border-primary bg-primary text-primary-foreground' : ''}`}>
                  {active && <Check className="mr-2 h-4 w-4 text-primary-foreground" />}{group.label}
                </Button>
              );
            })}
          </div>
        </div>
      </SettingRow>
      <SettingRow label="Exact behaviour" hint={MODE_DESCRIPTIONS[automationMode]}>
        <Select value={automationMode} onValueChange={(v) => handleModeChange(v as AutomationMode)}>
          <SelectTrigger className="h-11 w-48 shrink-0 text-base" aria-label="Exact automation behaviour"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(MODE_LABELS) as AutomationMode[]).map((mode) => <SelectItem key={mode} value={mode}>{MODE_LABELS[mode]}</SelectItem>)}</SelectContent>
        </Select>
      </SettingRow>
      {(automationMode === 'auto_gather' || automationMode === 'holiday') && (
        <SettingRow label="Check every" hint="Hours between gathers.">
              <div className="flex w-56 items-center gap-3">
                <Slider aria-label="Check every" value={[scrapeFrequency]} onValueChange={([v]) => handleScrapeFrequency(v!)} min={4} max={24} step={4} />
                <span className="w-12 text-right text-base">{scrapeFrequency}h</span>
              </div>
            </SettingRow>
      )}
      {(automationMode === 'auto_simplify' || automationMode === 'holiday') && (
        <SettingRow label="Story quality bar" hint="Only stories above this are written.">
              <div className="flex w-56 items-center gap-3">
                <Slider aria-label="Story quality bar" value={[qualityThreshold]} onValueChange={([v]) => handleQualityThreshold(v!)} min={30} max={100} step={5} />
                <span className="w-12 text-right text-base">{qualityThreshold}%</span>
              </div>
            </SettingRow>
      )}
      {automationMode === 'holiday' && (
        <SettingRow label="Add artwork" hint="Create pictures for new stories automatically.">
          <Switch aria-label="Add artwork" checked={autoIllustrateInHoliday} onCheckedChange={handleAutoIllustrateToggle} />
        </SettingRow>
      )}
      {(automationMode === 'auto_illustrate' || (automationMode === 'holiday' && autoIllustrateInHoliday)) && (
        <SettingRow label="Artwork quality bar" hint="Only stories above this get pictures.">
              <div className="flex w-56 items-center gap-3">
                <Slider aria-label="Artwork quality bar" value={[illustrationThreshold]} onValueChange={([v]) => handleIllustrationThreshold(v!)} min={50} max={100} step={5} />
                <span className="w-12 text-right text-base">{illustrationThreshold}%</span>
              </div>
            </SettingRow>
      )}
    </div>
  );
}
