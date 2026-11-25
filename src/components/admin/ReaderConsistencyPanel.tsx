import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { readerMismatches, type ConsistencyRow } from "@/lib/readerConsistency";

/** Admin-only: dashboard card Readers must equal Readers tab Readers for every feed (same 7 London days). */
export function ReaderConsistencyPanel() {
  const [rows, setRows] = useState<ConsistencyRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setLoading(true); setError(null);
    const { data, error } = await supabase.rpc("admin_reader_consistency" as any);
    setLoading(false);
    if (error) { setError("Couldn't run the check."); return; }
    setRows(((data as ConsistencyRow[]) ?? []).sort((a, b) => Number(b.tab_readers) - Number(a.tab_readers)));
  };

  const bad = rows ? readerMismatches(rows) : [];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Reader figures check</h2>
        <Button size="sm" variant="outline" onClick={run} disabled={loading}>{loading ? "Checking…" : "Run check"}</Button>
      </div>
      {error && <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {rows && (
        <>
          <p className="text-sm text-muted-foreground">
            {bad.length === 0 ? `All ${rows.length} feeds match.` : `${bad.length} of ${rows.length} feeds don't match.`}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-2">Feed</th><th>Card readers</th><th>Readers tab</th><th>Page loads (incl. bots and bounces)</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const mismatch = Number(r.card_readers) !== Number(r.tab_readers);
                  return (
                    <tr key={r.topic_id} className="border-t border-border">
                      <td className="py-2">{r.name}</td>
                      <td className={mismatch ? "text-destructive font-semibold" : ""}>{Number(r.card_readers)}</td>
                      <td className={mismatch ? "text-destructive font-semibold" : ""}>{Number(r.tab_readers)}</td>
                      <td className="text-muted-foreground">{Number(r.page_loads)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
