import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { BRAND_COLOURS } from "@/lib/feedSetup";
import { cn } from "@/lib/utils";

interface BrandConfig {
  logo_url?: string;
  subheader?: string;
  show_topic_name?: boolean;
  [key: string]: unknown;
}

/** Name, logo, colour and one-line welcome — the four things readers notice first. */
export function BrandBasics({
  topicId,
  name,
  colour,
  brandingConfig,
  onSaved,
}: {
  topicId: string;
  name: string;
  colour?: string;
  brandingConfig?: unknown;
  onSaved: (patch: { name?: string; illustration_primary_color?: string; branding_config?: BrandConfig }) => void;
}) {
  const { toast } = useToast();
  const config = ((brandingConfig as BrandConfig) || {}) as BrandConfig;
  const [feedName, setFeedName] = useState(name);
  const [welcome, setWelcome] = useState(config.subheader || "");
  const [state, setState] = useState<SaveState>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const hexColour = colour && /^#[0-9a-f]{6}$/i.test(colour) ? colour.toUpperCase() : null;

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

  const saveColour = (c: string) => save({ illustration_primary_color: c }, { illustration_primary_color: c });

  const uploadLogo = async (file: File) => {
    if (!file.type.startsWith("image/") || file.size > 2 * 1024 * 1024) {
      toast({ title: "Use an image under 2MB", description: "PNG, JPG, WebP or SVG.", variant: "destructive" });
      return;
    }
    setUploading(true);
    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const { data, error } = await supabase.functions.invoke("optimize-branding-image", {
        body: { topicId, imageType: "logo", base64Data, mimeType: file.type, originalFileName: file.name },
      });
      if (error || !data?.success) throw new Error(data?.error || error?.message || "Upload failed");
      const updated = { ...config, logo_url: data.originalUrl, show_topic_name: false, updated_at: new Date().toISOString() };
      await save({ branding_config: updated }, { branding_config: updated });
    } catch (e) {
      toast({ title: "Logo not uploaded", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = () => {
    const updated = { ...config, logo_url: undefined, show_topic_name: true, updated_at: new Date().toISOString() };
    save({ branding_config: updated }, { branding_config: updated });
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end"><SaveIndicator state={state} /></div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="brand-name" className="text-sm font-medium">Name</label>
          <Input id="brand-name" value={feedName} onChange={(e) => setFeedName(e.target.value)} onBlur={saveName} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="h-11 text-base" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="brand-welcome" className="text-sm font-medium">Welcome line</label>
          <Input id="brand-welcome" value={welcome} placeholder="One sentence shown under the name" onChange={(e) => setWelcome(e.target.value)} onBlur={saveWelcome} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className="h-11 text-base" />
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium" id="brand-colour">Colour</p>
        <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="brand-colour">
          {BRAND_COLOURS.concat(hexColour && !BRAND_COLOURS.includes(hexColour) ? [hexColour] : []).map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={hexColour === c}
              aria-label={`Colour ${c}`}
              onClick={() => saveColour(c)}
              className={cn("flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background", hexColour === c ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border")}
              style={{ background: c }}
            >
              {hexColour === c && <Check className="h-4 w-4 text-primary-foreground" aria-hidden="true" />}
            </button>
          ))}
          <label className="ml-1 cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
            Custom
            <input type="color" value={hexColour || "#2563EB"} onChange={(e) => saveColour(e.target.value.toUpperCase())} className="sr-only" />
          </label>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Logo</p>
        <div className="flex items-center gap-3">
          {config.logo_url ? (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2">
              <img src={config.logo_url} alt="Current logo" className="h-10 max-w-[180px] object-contain" />
              <Button variant="ghost" size="icon" onClick={removeLogo} aria-label="Remove logo"><X className="h-4 w-4" /></Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No logo — the feed name is shown instead.</p>
          )}
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {config.logo_url ? "Replace" : "Upload"}
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadLogo(f); }} />
        </div>
      </div>
    </div>
  );
}
