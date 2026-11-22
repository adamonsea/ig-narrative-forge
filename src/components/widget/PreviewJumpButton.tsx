import { useEffect, useState, type RefObject } from "react";
import { Eye } from "lucide-react";

/**
 * Phone-only floating "Preview" pill for the widget builders: jumps to the live preview
 * and hides itself while the preview is on screen.
 */
export function PreviewJumpButton({ target }: { target: RefObject<HTMLElement | null> }) {
  const [previewVisible, setPreviewVisible] = useState(false);

  useEffect(() => {
    const el = target.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => setPreviewVisible(!!entry?.isIntersecting), { threshold: 0.15 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [target]);

  if (previewVisible) return null;
  return (
    <button
      type="button"
      onClick={() => target.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="fixed bottom-4 left-1/2 z-40 flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-5 text-base font-medium text-primary-foreground shadow-lg lg:hidden"
    >
      <Eye className="h-4 w-4" aria-hidden="true" />
      Preview
    </button>
  );
}
