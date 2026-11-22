import { useEffect, useMemo, useRef, useState } from "react";
import { WIDGET_JS_VERSION } from "@/lib/widgetEmbed";

/**
 * Builder preview that runs the real embed script (public/widget.js) in a sandboxed-style
 * same-origin frame, so the preview always matches what visitors see: news, What's on,
 * tabs, dates and subscribe box. data-preview keeps it out of widget figures.
 */
export function LiveWidgetPreview({
  attrs,
  title = "Widget preview",
}: {
  /** data-* values without the "data-" prefix, e.g. { feed: "eastbourne", content: "both" } */
  attrs: Record<string, string>;
  title?: string;
}) {
  const [origin, setOrigin] = useState<string | null>(null);
  const [debounced, setDebounced] = useState(attrs);
  const [height, setHeight] = useState(320);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const attrsKey = JSON.stringify(attrs);

  useEffect(() => setOrigin(window.location.origin), []);
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(attrs), 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attrsKey]);

  const srcDoc = useMemo(() => {
    if (!origin) return null;
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
    const dataAttrs = Object.entries(debounced)
      .filter(([k, v]) => /^[a-z-]+$/.test(k) && v !== "")
      .map(([k, v]) => ` data-${k}="${esc(v)}"`)
      .join("");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;padding:0;background:transparent}</style></head><body><div${dataAttrs} data-preview="true"></div><script src="${origin}/widget.js?v=${WIDGET_JS_VERSION}"></script></body></html>`;
  }, [origin, debounced]);

  // Grow the frame with the widget so nothing scrolls inside it
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || !srcDoc) return;
    let observer: ResizeObserver | null = null;
    const onLoad = () => {
      const doc = frame.contentDocument;
      if (!doc) return;
      // Measure the content, not the page: the page is never shorter than the frame, so it could only grow
      const measure = () => setHeight(Math.max(120, Math.ceil(doc.body.getBoundingClientRect().height)));
      measure();
      observer?.disconnect();
      observer = new ResizeObserver(measure);
      observer.observe(doc.body);
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      observer?.disconnect();
    };
  }, [srcDoc]);

  if (!srcDoc) return <div className="h-80 w-full animate-pulse rounded-xl bg-muted" />;
  return (
    <iframe
      ref={frameRef}
      title={title}
      srcDoc={srcDoc}
      className="block w-full border-0 bg-transparent"
      style={{ height }}
    />
  );
}
