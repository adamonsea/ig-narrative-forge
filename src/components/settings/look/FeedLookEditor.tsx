import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SaveIndicator, type SaveState } from "@/components/ui/editorial";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { BRAND_COLOURS } from "@/lib/feedSetup";
import { buttonTone, parseColor, toCss } from "@/lib/feedBrandColor";
import {
  BACKGROUND_PRESETS, DEFAULT_BACKGROUND, DEFAULT_TOP_BAR, TOP_BAR_PRESETS,
  resolveSurface, type SurfacePreset,
} from "@/lib/feedSurfaces";
import { resolveStoryCoverStyle, STORY_COVER_LABELS, STORY_COVER_STYLES, type StoryCoverStyle } from "@/lib/storyCoverStyle";
import { cn } from "@/lib/utils";
import { FeedLookPreview } from "./FeedLookPreview";

interface BrandConfig {
  logo_url?: string | undefined;
  primary_color?: string | undefined;
  top_bar_color?: string | undefined;
  feed_background_color?: string | undefined;
  show_topic_name?: boolean | undefined;
  subheader?: string | undefined;
  [key: string]: unknown;
}

export interface FeedLookPatch {
  illustration_primary_color?: string | undefined;
  branding_config?: BrandConfig | undefined;
  story_cover_style?: string | undefined;
}

interface Props {
  topicId: string;
  name: string;
  colour?: string | null | undefined;
  brandingConfig?: unknown;
  coverStyle?: string | null | undefined;
  regional?: boolean | undefined;
  eventsEnabled?: boolean | undefined;
  onSaved: (patch: FeedLookPatch) => void;
}

const isHex = (c: string | null | undefined): c is string => !!c && /^#[0-9a-f]{6}$/i.test(c);
const upper = (c: string) => c.toUpperCase();

/** One round swatch; the tick is drawn in whichever of white/ink reads on it. */
function Swatch({ label, fill, selected, onClick }: { label: string; fill: string; selected: boolean; onClick: () => void }) {
  const rgb = parseColor(fill) ?? [255, 255, 255];
  const tick = toCss(buttonTone(rgb).onFill);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-full border border-border ring-offset-2 ring-offset-card transition-shadow",
        selected ? "ring-2 ring-foreground" : "hover:ring-2 hover:ring-border",
      )}
      style={{ background: fill }}
    >
      {selected && <Check className="h-4 w-4" style={{ color: tick }} aria-hidden="true" />}
    </button>
  );
}

function SwatchRow({
  id, label, presets, value, brand, onPick,
}: {
  id: string;
  label: string;
  presets: SurfacePreset[];
  /** Current choice, already resolved to a preset value or hex (never empty). */
  value: string;
  brand: string | null | undefined;
  onPick: (value: string, live?: boolean) => void;
}) {
  const known = presets.some((p) => p.value.toLowerCase() === value.toLowerCase());
  const custom = !known && isHex(value) ? upper(value) : null;
  const pickerValue = isHex(value) ? value : toHex(resolveSurface(value, brand, "#FFFFFF"));
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium" id={id}>{label}</p>
      <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby={id}>
        {presets.map((p) => (
          <Swatch
            key={p.value}
            label={p.label}
            fill={p.value === "brand" ? toCss(resolveSurface("brand", brand, "#FFFFFF")) : p.value}
            selected={p.value.toLowerCase() === value.toLowerCase()}
            onClick={() => onPick(p.value)}
          />
        ))}
        {custom && <Swatch label={`Custom ${custom}`} fill={custom} selected onClick={() => {}} />}
        <label className="ml-1 cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
          Custom
          <input type="color" value={pickerValue} onChange={(e) => onPick(upper(e.target.value), true)} className="sr-only" />
        </label>
      </div>
    </div>
  );
}

function toHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/**
 * The feed's look in one place: logo, colour, top bar, background and story
 * cover, with a live phone preview beside them. Every pick shows at once and
 * auto-saves; contrast of everything on the bar and background is automatic.
 */
export function FeedLookEditor({ topicId, name, colour, brandingConfig, coverStyle, regional, eventsEnabled, onSaved }: Props) {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const config = ((brandingConfig as BrandConfig) || {}) as BrandConfig;
  const configRef = useRef<BrandConfig>(config);
  useEffect(() => { configRef.current = config; }, [brandingConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const [accent, setAccent] = useState<string | null>(isHex(colour) ? upper(colour) : null);
  const [topBar, setTopBar] = useState<string | undefined>(config.top_bar_color);
  const [background, setBackground] = useState<string | undefined>(config.feed_background_color);
  const [cover, setCover] = useState<StoryCoverStyle>(resolveStoryCoverStyle(coverStyle));
  const [state, setState] = useState<SaveState>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = useRef<Partial<BrandConfig>>({});
  const configTimer = useRef<number | undefined>(undefined);
  const colourTimer = useRef<number | undefined>(undefined);

  useEffect(() => setAccent(isHex(colour) ? upper(colour) : null), [colour]);
  useEffect(() => setCover(resolveStoryCoverStyle(coverStyle)), [coverStyle]);

  const save = async (values: Record<string, unknown>, local: FeedLookPatch) => {
    setState("saving");
    const { error } = await supabase.from("topics").update({ ...values, updated_at: new Date().toISOString() } as never).eq("id", topicId);
    if (error) {
      setState("not-saved");
      return false;
    }
    setState("saved");
    onSaved(local);
    window.setTimeout(() => setState((s) => (s === "saved" ? null : s)), 2000);
    return true;
  };

  const flushConfig = () => {
    const patch = pending.current;
    pending.current = {};
    if (Object.keys(patch).length === 0) return;
    const next: BrandConfig = { ...configRef.current, ...patch, updated_at: new Date().toISOString() };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    configRef.current = next;
    void save({ branding_config: next }, { branding_config: next });
  };

  const queueConfig = (patch: Partial<BrandConfig>, live = false) => {
    Object.assign(pending.current, patch);
    window.clearTimeout(configTimer.current);
    configTimer.current = window.setTimeout(flushConfig, live ? 400 : 0);
  };

  // Don't lose a custom colour picked just before leaving the page.
  useEffect(() => () => { window.clearTimeout(configTimer.current); flushConfig(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickAccent = (c: string, live = false) => {
    setAccent(c);
    window.clearTimeout(colourTimer.current);
    colourTimer.current = window.setTimeout(() => void save({ illustration_primary_color: c }, { illustration_primary_color: c }), live ? 400 : 0);
  };

  const pickTopBar = (value: string, live = false) => {
    const stored = value.toUpperCase() === DEFAULT_TOP_BAR ? undefined : value;
    setTopBar(stored);
    queueConfig({ top_bar_color: stored }, live);
  };

  const pickBackground = (value: string, live = false) => {
    const stored = value.toUpperCase() === DEFAULT_BACKGROUND ? undefined : value;
    setBackground(stored);
    queueConfig({ feed_background_color: stored }, live);
  };

  const pickCover = async (next: StoryCoverStyle) => {
    if (next === cover) return;
    const before = cover;
    setCover(next);
    const ok = await save({ story_cover_style: next }, { story_cover_style: next });
    if (!ok) setCover(before);
  };

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
      queueConfig({ logo_url: data.originalUrl, show_topic_name: false });
    } catch (e) {
      toast({ title: "Logo not uploaded", description: e instanceof Error ? e.message : "Please try again.", variant: "destructive" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const removeLogo = () => queueConfig({ logo_url: undefined, show_topic_name: true });

  // The feed itself prefers an older saved primary_color, so the preview does too.
  const brand = config.primary_color || accent;
  const logoUrl = config.logo_url || null;
  const accentChoices = BRAND_COLOURS.concat(accent && !BRAND_COLOURS.includes(accent) ? [accent] : []);

  return (
    <section aria-labelledby="feed-look-title" className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-col md:flex-row">
        <div className="flex justify-center border-b border-border bg-muted/60 p-6 md:order-2 md:w-[340px] md:shrink-0 md:border-b-0 md:border-l">
          <div className="md:sticky md:top-24 md:self-start">
            <FeedLookPreview
              name={name}
              welcome={config.subheader}
              logoUrl={logoUrl}
              brand={brand}
              topBar={topBar}
              background={background}
              coverStyle={cover}
              regional={regional}
              showToggle={eventsEnabled}
              width={isMobile ? 220 : 270}
            />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-6 p-6">
          <div className="flex items-center justify-between gap-3">
            <h3 id="feed-look-title" className="text-lg font-semibold">Look</h3>
            <SaveIndicator state={state} />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Logo</p>
            <div className="flex flex-wrap items-center gap-3">
              {logoUrl ? (
                <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
                  <img src={logoUrl} alt="Current logo" className="h-10 max-w-[160px] object-contain" />
                  <Button variant="ghost" size="icon" onClick={removeLogo} aria-label="Remove logo" title="Remove logo"><X className="h-4 w-4" /></Button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No logo</p>
              )}
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={uploading} className="gap-1.5">
                {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {logoUrl ? "Replace" : "Upload"}
              </Button>
              <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadLogo(f); }} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id="look-colour">Colour</p>
            <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-labelledby="look-colour">
              {accentChoices.map((c) => (
                <Swatch key={c} label={`Colour ${c}`} fill={c} selected={accent === c} onClick={() => pickAccent(c)} />
              ))}
              <label className="ml-1 cursor-pointer text-sm text-muted-foreground underline-offset-4 hover:underline">
                Custom
                <input type="color" value={accent || "#2563EB"} onChange={(e) => pickAccent(upper(e.target.value), true)} className="sr-only" />
              </label>
            </div>
          </div>

          <SwatchRow id="look-top-bar" label="Top bar" presets={TOP_BAR_PRESETS} value={topBar || DEFAULT_TOP_BAR} brand={brand} onPick={pickTopBar} />
          <SwatchRow id="look-background" label="Background" presets={BACKGROUND_PRESETS} value={background || DEFAULT_BACKGROUND} brand={brand} onPick={pickBackground} />

          <div className="space-y-2">
            <p className="text-sm font-medium" id="look-cover">Story cover</p>
            <div className="inline-flex gap-1 rounded-lg bg-muted p-1" role="radiogroup" aria-labelledby="look-cover">
              {STORY_COVER_STYLES.map((style) => (
                <button
                  key={style}
                  type="button"
                  role="radio"
                  aria-checked={cover === style}
                  onClick={() => void pickCover(style)}
                  className={cn(
                    "min-h-11 rounded-md px-4 text-base transition-colors",
                    cover === style ? "bg-card font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {STORY_COVER_LABELS[style]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
