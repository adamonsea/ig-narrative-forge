export type ConsistencyRow = {
  topic_id: string; name: string;
  card_readers: number | null; tab_readers: number | null; page_loads: number | null;
};

/** Feeds whose dashboard card Readers differ from the Readers tab for the same window. */
export function readerMismatches(rows: ConsistencyRow[]): ConsistencyRow[] {
  return rows.filter((r) => Number(r.card_readers ?? 0) !== Number(r.tab_readers ?? 0));
}
