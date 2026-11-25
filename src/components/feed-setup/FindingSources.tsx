import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface FoundChip { url: string; name: string; group: "news" | "events" }

const REVEAL_MS = 520;

/** "Finding sources for {name}": a sweep line, then real chips landing one by one. */
export function FindingSources({ name, chips, done }: { name: string; chips: FoundChip[]; done: boolean }) {
  // Reveal staggered even when results arrive together, news and events interleaved
  const [shown, setShown] = useState(0);
  const order = useRef<FoundChip[]>([]);
  const news = chips.filter((c) => c.group === "news");
  const events = chips.filter((c) => c.group === "events");
  const interleaved: FoundChip[] = [];
  for (let i = 0; i < Math.max(news.length, events.length); i++) {
    if (news[i]) interleaved.push(news[i]!);
    if (events[i]) interleaved.push(events[i]!);
  }
  // Keep already-shown chips in place; append new ones
  const known = new Set(order.current.map((c) => c.url));
  order.current = [...order.current, ...interleaved.filter((c) => !known.has(c.url))];
  const total = order.current.length;

  useEffect(() => {
    if (shown >= total) return;
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 150 : REVEAL_MS);
    return () => clearTimeout(t);
  }, [shown, total]);

  const visible = order.current.slice(0, shown);
  const finished = done && shown >= total;
  const groups: { key: FoundChip["group"]; label: string }[] = [
    { key: "news", label: "News" },
    { key: "events", label: "What's on" },
  ];

  return (
    <div className="space-y-10 py-4">
      <div className="space-y-6">
        <h1 className="text-center font-display text-[44px] font-normal leading-tight md:text-[52px]">Finding sources for {name}</h1>
        <div className="relative mx-auto h-[3px] w-full max-w-md overflow-hidden rounded-full bg-muted" aria-hidden="true">
          {finished ? <div className="h-full w-full bg-pop" /> : <div className="setup-sweep h-full w-[30%] bg-gradient-to-r from-transparent via-pop to-transparent" />}
        </div>
      </div>
      {groups.map(({ key, label }) => {
        const list = visible.filter((c) => c.group === key);
        if (!list.length) return null;
        return (
          <section key={key} className="setup-rise space-y-3">
            <h2 className="text-sm font-semibold text-muted-foreground">{label}</h2>
            <ul className="flex flex-wrap gap-3">
              {list.map((c) => (
                <li key={c.url} className={cn("setup-land inline-flex h-[54px] items-center gap-3 rounded-full border-[1.5px] bg-card pl-2 pr-5 text-lg font-medium", key === "events" ? "border-purple-bright/40" : "border-border")}>
                  <SourceMark url={c.url} name={c.name} />
                  <span className="max-w-[220px] truncate">{c.name}</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-center text-xl text-muted-foreground" aria-live="polite">
        {finished ? `${total} source${total === 1 ? "" : "s"} found` : ""}
      </p>
    </div>
  );
}

function SourceMark({ url, name }: { url: string; name: string }) {
  const [failed, setFailed] = useState(false);
  let host = "";
  try { host = new URL(url).hostname; } catch { /* keep initial */ }
  return (
    <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-base font-semibold" aria-hidden="true">
      {host && !failed ? (
        <img src={`https://www.google.com/s2/favicons?domain=${host}&sz=64`} alt="" className="h-6 w-6" onError={() => setFailed(true)} />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}
