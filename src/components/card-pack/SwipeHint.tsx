import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

interface SwipeHintProps {
  visible: boolean;
  /** Bumping this signal hides the hint immediately (e.g. on user gesture). */
  dismissSignal?: number;
  /** localStorage key used to suppress the hint on subsequent visits. */
  storageKey?: string;
}

/**
 * First-visit hint nudging the user to swipe the fan. Self-dismisses after
 * 4s or on first gesture. Persists "seen" state via localStorage so returning
 * visitors aren't nagged.
 */
export const SwipeHint = ({
  visible,
  dismissSignal = 0,
  storageKey = "cp-swipe-hint-seen",
}: SwipeHintProps) => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    if (typeof window === "undefined") return;
    let seen = false;
    try { seen = !!window.localStorage.getItem(storageKey); } catch { /* private mode */ }
    if (seen) return;
    const t = window.setTimeout(() => setShow(true), 600);
    const auto = window.setTimeout(() => persistAndHide(), 4600);
    return () => { window.clearTimeout(t); window.clearTimeout(auto); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (dismissSignal > 0) persistAndHide();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dismissSignal]);

  function persistAndHide() {
    setShow(false);
    try { window.localStorage.setItem(storageKey, "1"); } catch { /* ignore */ }
  }

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="hint"
          className="absolute left-1/2 pointer-events-none"
          style={{ bottom: 24, transform: "translateX(-50%)" }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.3 }}
          aria-hidden
        >
          <div
            className="cp-mono text-[11px] tracking-[0.22em] uppercase px-3 py-1.5 rounded-full flex items-center gap-2"
            style={{
              background: "var(--cp-card-surface)",
              color: "var(--cp-muted)",
              border: "1px solid var(--cp-hairline)",
              boxShadow: "0 6px 16px rgba(0,0,0,0.12)",
            }}
          >
            <motion.span
              animate={{ x: [-3, 3, -3] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              ← swipe →
            </motion.span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
