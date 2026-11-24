// @ts-nocheck -- vendored card-pack-reveal skill; written for looser compiler settings
import { motion } from "framer-motion";
import type { RenderSleeveContext, CardPackSleeveConfig } from "./types";

interface DefaultSleeveProps extends RenderSleeveContext {
  sleeve?: CardPackSleeveConfig;
}

/**
 * Built-in sleeve body: logo, tagline, ornament, big circular CTA.
 * Use the `renderSleeve` prop on CardPack to replace this entirely.
 */
export const DefaultSleeve = ({ openLabel, onOpen, sleeve }: DefaultSleeveProps) => {
  const tagline = sleeve?.tagline;
  const logo = sleeve?.logo;

  return (
    <div className="flex flex-col items-center justify-center h-full pointer-events-auto px-6 text-center">
      {logo && (
        <div style={{ width: "min(72%, 364px)", filter: "drop-shadow(0 6px 14px rgba(0,0,0,0.25))" }}>
          {logo}
        </div>
      )}
      {tagline && (
        <div
          className="cp-serif italic mt-3"
          style={{ color: "var(--cp-sleeve-text)", fontSize: "clamp(20px, 5.5vw, 34px)" }}
        >
          {tagline}
        </div>
      )}
      <div className="flex items-center justify-center mt-4">
        <span
          style={{
            display: "inline-block", width: 36, height: 1,
            background: "var(--cp-accent)", opacity: 0.7,
          }}
        />
      </div>
      <motion.button
        className="mt-10 w-24 h-24 rounded-full flex items-center justify-center cp-mono text-sm font-semibold tracking-[0.18em] uppercase focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 cp-pulse-cta"
        onClick={onOpen}
        whileTap={{ scale: 0.95 }}
        aria-label={openLabel}
        style={{
          background: "var(--cp-accent)",
          color: "var(--cp-accent-text)",
          border: "1px solid rgba(255,255,255,0.25)",
          boxShadow: "0 6px 18px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.25)",
          outlineColor: "var(--cp-card-surface)",
          position: "relative",
          zIndex: 30,
        }}
      >
        {openLabel}
      </motion.button>
    </div>
  );
};
