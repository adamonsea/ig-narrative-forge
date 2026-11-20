import { useEffect, useRef, useState } from "react";
import { Loader2, Upload, ZoomIn, ZoomOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { InlineError } from "@/components/ui/editorial";
import { cn } from "@/lib/utils";
import { CENTRED, MAX_ZOOM, type Framing, clampFraming, cropRect, panBy } from "@/lib/pictureFrame";
import { MAX_UPLOAD_BYTES, MIN_PICTURE_WIDTH, loadImage } from "./savePicture";

export interface FrameGuide { aspect: number; label: string }

interface PictureEditorProps {
  /** Frame shape (width / height). */
  aspect: number;
  /** Dashed outlines for what narrower or wider surfaces keep (e.g. feed card, poster). */
  guides?: FrameGuide[] | undefined;
  initialFraming?: Framing | null | undefined;
  /** The uncropped picture to frame; null when there isn't one yet. */
  loadSource: () => Promise<Blob | null>;
  /** One quiet line shown above Save (e.g. what the save also changes). */
  note?: string | null | undefined;
  onSave: (img: HTMLImageElement, framing: Framing, replaced: boolean) => Promise<void>;
  onCancel: () => void;
}

/** Guide box inside the frame, as percentages. */
function guideBox(frame: number, guide: number) {
  return guide < frame ? { width: `${(guide / frame) * 100}%`, height: "100%" } : { width: "100%", height: `${(frame / guide) * 100}%` };
}

/**
 * Replace a picture or move it within its frame. Drag to move, slider or +/- to zoom,
 * arrow keys to nudge. Saving bakes the frame into a new file (see savePicture.ts).
 */
export function PictureEditor({ aspect, guides = [], initialFraming, loadSource, note, onSave, onCancel }: PictureEditorProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [framing, setFraming] = useState<Framing>(CENTRED);
  const [replaced, setReplaced] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [frameW, setFrameW] = useState(0);

  useEffect(() => {
    let alive = true;
    loadSource()
      .then(async (blob) => {
        if (!alive) return;
        if (!blob) { setLoading(false); return; }
        const el = await loadImage(blob);
        if (!alive) return;
        setImg(el);
        setFraming(clampFraming(el.naturalWidth, el.naturalHeight, aspect, initialFraming ?? CENTRED));
        setLoading(false);
      })
      .catch(() => { if (alive) { setLoading(false); setError("Couldn't open this picture. Replace it instead."); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([entry]) => setFrameW(entry!.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const W = img?.naturalWidth ?? 1;
  const H = img?.naturalHeight ?? 1;
  const crop = img ? cropRect(W, H, aspect, framing) : null;
  const scale = crop && frameW ? frameW / crop.sw : 0;
  const move = (dx: number, dy: number) => { if (img && frameW) setFraming((f) => panBy(W, H, aspect, f, dx, dy, frameW)); };
  const zoomTo = (z: number) => { if (img) setFraming((f) => clampFraming(W, H, aspect, { ...f, zoom: z })); };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { setError("Use a JPG, PNG or WebP picture."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError("Picture is over 15 MB."); return; }
    try {
      const el = await loadImage(file);
      if (el.naturalWidth < MIN_PICTURE_WIDTH) { setError(`Picture is too small (under ${MIN_PICTURE_WIDTH} pixels wide).`); return; }
      setImg(el); setReplaced(true); setFraming(clampFraming(el.naturalWidth, el.naturalHeight, aspect, CENTRED));
    } catch { setError("Couldn't open that picture."); }
  };

  const save = async () => {
    if (!img) return;
    setSaving(true); setError(null);
    try { await onSave(img, framing, replaced); }
    catch { setError("Couldn't save the picture."); setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <div
        ref={frameRef}
        role={img ? "application" : undefined}
        aria-label={img ? "Picture frame. Drag or use arrow keys to move, plus and minus to zoom." : undefined}
        tabIndex={img ? 0 : -1}
        className={cn("relative w-full overflow-hidden rounded-lg border border-border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          img && "cursor-grab touch-none select-none active:cursor-grabbing")}
        style={{ aspectRatio: String(aspect) }}
        onPointerDown={(e) => { if (!img) return; e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; }}
        onPointerMove={(e) => { if (!drag.current) return; move(e.clientX - drag.current.x, e.clientY - drag.current.y); drag.current = { x: e.clientX, y: e.clientY }; }}
        onPointerUp={() => { drag.current = null; }}
        onPointerCancel={() => { drag.current = null; }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 40 : 10;
          const keys: Record<string, () => void> = {
            ArrowLeft: () => move(step, 0), ArrowRight: () => move(-step, 0), ArrowUp: () => move(0, step), ArrowDown: () => move(0, -step),
            "+": () => zoomTo(framing.zoom + 0.1), "=": () => zoomTo(framing.zoom + 0.1), "-": () => zoomTo(framing.zoom - 0.1),
          };
          const fn = keys[e.key];
          if (fn) { e.preventDefault(); fn(); }
        }}
      >
        {loading && <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden="true" />}
        {img && crop && scale > 0 && (
          <img
            src={img.src}
            alt=""
            draggable={false}
            className="pointer-events-none absolute max-w-none"
            style={{ width: W * scale, height: H * scale, left: -crop.sx * scale, top: -crop.sy * scale }}
          />
        )}
        {img && guides.map((g) => (
          <div key={g.label} aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative rounded-sm border-2 border-dashed border-background/90 shadow-[0_0_0_1px_hsl(var(--foreground)/0.25)]" style={guideBox(aspect, g.aspect)}>
              <span className="absolute left-1 top-1 rounded bg-foreground/60 px-1.5 text-sm text-background">{g.label}</span>
            </div>
          </div>
        ))}
        {!loading && !img && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" aria-hidden="true" />Choose picture</Button>
          </div>
        )}
      </div>

      {img && (
        <div className="flex items-center gap-3">
          <ZoomOut className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Slider aria-label="Zoom" min={1} max={MAX_ZOOM} step={0.01} value={[framing.zoom]} onValueChange={([z]) => zoomTo(z ?? 1)} />
          <ZoomIn className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" tabIndex={-1} aria-hidden="true"
        onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />

      {error && <InlineError message={error} actionLabel="Dismiss" onAction={() => setError(null)} />}
      {note && img && <p className="text-sm text-muted-foreground">{note}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={saving}>
          <Upload className="mr-2 h-4 w-4" aria-hidden="true" />Replace
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={() => void save()} disabled={!img || saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}Save
          </Button>
        </div>
      </div>
    </div>
  );
}
