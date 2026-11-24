import { useEffect, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { findSettings, type SettingEntry } from "@/lib/settingsIndex";
import { SETTINGS_SECTIONS, type SettingsSectionId } from "@/lib/settingsSections";
import { cn } from "@/lib/utils";

const sectionLabel = (id: SettingsSectionId) => SETTINGS_SECTIONS.find((s) => s.id === id)?.label ?? id;

/** "Find a setting": local index only. ⌘K / Ctrl+K focuses it; Enter or click jumps to the row. */
export function SettingsSearch({ visible, onPick }: { visible: readonly SettingsSectionId[]; onPick: (entry: SettingEntry) => void }) {
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const results = findSettings(q, visible);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.current?.focus();
        input.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const pick = (entry: SettingEntry | undefined) => {
    if (!entry) return;
    onPick(entry);
    setQ("");
    setOpen(false);
    input.current?.blur();
  };

  return (
    <div className="relative mb-2 md:mb-4">
      <Search aria-hidden className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        ref={input}
        type="text"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-label="Find a setting"
        placeholder="Find a setting"
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); pick(results[active]); }
          else if (e.key === "Escape") { setQ(""); setOpen(false); }
        }}
        className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-10 text-base placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-[hsl(var(--purple-bright))]"
      />
      <kbd aria-hidden className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 text-sm text-muted-foreground md:block">⌘K</kbd>
      {open && q.trim() && (
        <ul id={listId} role="listbox" className="absolute left-0 right-0 z-30 mt-2 max-h-96 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg md:w-80">
          {results.length === 0 && <li className="px-3 py-3 text-base text-muted-foreground">No matching setting</li>}
          {results.map((r, i) => (
            <li key={`${r.section}-${r.anchor}`} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(r)}
                className={cn("flex w-full flex-col items-start rounded-lg px-3 py-2 text-left", i === active && "bg-muted")}
              >
                <span className="text-base font-medium">{r.label} <span className="font-normal text-muted-foreground">· {sectionLabel(r.section)}</span></span>
                <span className="text-sm text-muted-foreground">{r.hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
