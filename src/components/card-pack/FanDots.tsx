import { motion } from "framer-motion";

interface FanDotsProps {
  count: number;
  active: number;
  visible: boolean;
  onSelect?: (index: number) => void;
}

export const FanDots = ({ count, active, visible, onSelect }: FanDotsProps) => {
  return (
    <motion.div
      className="flex-shrink-0 px-6 pb-1 pt-0 text-center"
      style={{ marginTop: "-4px" }}
      initial={false}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 0.3 }}
      aria-hidden={!visible}
    >
      <div
        className="flex items-center justify-center gap-1.5"
        role="tablist"
        aria-label="Card pack pagination"
      >
        {Array.from({ length: count }).map((_, i) => (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={i === active}
            aria-label={`Show card ${i + 1} of ${count}`}
            tabIndex={visible ? 0 : -1}
            onClick={() => onSelect?.(i)}
            style={{
              width: i === active ? "16px" : "5px",
              height: "5px",
              borderRadius: "3px",
              background: i === active ? "var(--cp-title)" : "var(--cp-hairline)",
              border: "none",
              padding: 0,
              cursor: "pointer",
              transition: "all 0.3s",
            }}
          />
        ))}
      </div>
    </motion.div>
  );
};
