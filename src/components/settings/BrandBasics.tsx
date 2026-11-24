import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SettingGroup, SettingRow } from "@/components/settings/SettingRow";

interface BrandConfig {
  logo_url?: string | undefined;
  subheader?: string | undefined;
  show_topic_name?: boolean | undefined;
  [key: string]: unknown;
}

/** Name and one-line welcome. Logo, colours and cover live in the Look panel (FeedLookEditor). */
export function BrandBasics({
  topicId,
  name,
  brandingConfig,
  onSaved,
}: {
  topicId: string;
  name: string;
  colour?: string | undefined;
  brandingConfig?: unknown | undefined;
  onSaved: (patch: { name?: string | undefined; illustration_primary_color?: string | undefined; branding_config?: BrandConfig | undefined }) => void;
}) {
  const { toast } = useToast();
  const config = ((brandingConfig as BrandConfig) || {}) as BrandConfig;
  const [feedName, setFeedName] = useState(name);
  const [welcome, setWelcome] = useState(config.subheader || "");
  const [state, setState] = useState<SaveState>(null);

  useEffect(() => setFeedName(name), [name]);
  useEffect(() => setWelcome(config.subheader || ""), [config.subheader]);

  const save = async (patch: Record<string, unknown>, local: Parameters<typeof onSaved>[0]) => {
    setState("saving");
    const { error } = await supabase.from("topics").update({ ...patch, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) {
      setState("not-saved");
      toast({ title: "Not saved", description: error.message, variant: "destructive" });
      return;
    }
    setState("saved");
    onSaved(local);
    window.setTimeout(() => setState(null), 2000);
  };

  const saveName = () => {
    const next = feedName.trim().slice(0, 60);
    if (!next || next === name) { setFeedName(name); return; }
    save({ name: next }, { name: next });
  };

  const saveWelcome = () => {
    const next = welcome.trim().slice(0, 110);
    if (next === (config.subheader || "")) return;
    const updated = { ...config, subheader: next || undefined, updated_at: new Date().toISOString() };
    save({ branding_config: updated }, { branding_config: updated });
  };

  const enter = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); };
  return (
    <SettingGroup>
      <SettingRow label="Name" hint="Shown at the top of the feed." stack>
        <div className="flex items-center gap-3">
          <Input id="brand-name" aria-label="Name" value={feedName} onChange={(e) => setFeedName(e.target.value)} onBlur={saveName} onKeyDown={enter} className="h-11 text-base" />
          <SaveIndicator state={state} />
        </div>
      </SettingRow>
      <SettingRow label="Welcome line" hint="One sentence under the name." stack>
        <Input id="brand-welcome" aria-label="Welcome line" value={welcome} onChange={(e) => setWelcome(e.target.value)} onBlur={saveWelcome} onKeyDown={enter} className="h-11 text-base" />
      </SettingRow>
    </SettingGroup>
  );
}
