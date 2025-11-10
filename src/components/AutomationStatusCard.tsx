import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles, Loader2 } from "lucide-react";

interface AutomationStatusCardProps {
  topicId: string;
}

interface AutomationSettings {
  automation_mode: string;
  auto_simplify_enabled: boolean;
  quality_threshold: number;
}

const AUTOMATION_MODE_LABELS: Record<string, string> = {
  manual: 'Manual review',
  auto_gather: 'Auto-gather only',
  auto_simplify: 'Smart summaries on',
  auto_illustrate: 'Full automation',
  holiday: 'Holiday mode'
};

export const AutomationStatusCard = ({ topicId }: AutomationStatusCardProps) => {
  const [settings, setSettings] = useState<AutomationSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, [topicId]);

  const loadSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('topic_automation_settings')
        .select('automation_mode, auto_simplify_enabled, quality_threshold')
        .eq('topic_id', topicId)
        .maybeSingle();

      if (error) throw error;

      setSettings(data || {
        automation_mode: 'manual',
        auto_simplify_enabled: false,
        quality_threshold: 60
      });
    } catch (error) {
      console.error('Error loading automation settings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
        <div className="flex items-center justify-center h-20">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  const modeLabel = settings?.automation_mode 
    ? AUTOMATION_MODE_LABELS[settings.automation_mode] || 'Unknown mode'
    : 'Not configured';

  return (
    <div className="rounded-lg border border-border/60 bg-background/40 p-4 shadow-sm">
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        Automation
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="mt-2 text-lg font-semibold">
        {modeLabel}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Quality threshold: <span className="font-medium">{settings?.quality_threshold ?? 60}%</span>
      </p>
    </div>
  );
};
