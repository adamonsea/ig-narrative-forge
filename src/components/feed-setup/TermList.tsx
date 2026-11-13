import { useState } from "react";
import { Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { visibleTerms } from "@/lib/termLists";
import { cn } from "@/lib/utils";

/**
 * One editable list of plain words: tap × to remove, type and press Enter to add
 * (commas add several). Long lists show their first 10 terms with a search box
 * and "Show all", so the page stays short.
 */
export function TermList({
  label,
  hint,
  terms,
  onAdd,
  onRemove,
  tone = "more",
  placeholder,
  notice,
  headerAction,
  children,
}: {
  label: string;
  hint?: string;
  terms: string[];
  onAdd: (term: string) => void;
  onRemove: (term: string) => void;
  tone?: "more" | "less";
  placeholder?: string;
  /** A short, temporary note under the input, e.g. "“pier” moved from Less of this". */
  notice?: string | null;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const { shown, hidden, collapsible } = visibleTerms(terms, { query, showAll });

  const commit = () => {
    draft.split(",").map((p) => p.trim()).filter(Boolean).forEach(onAdd);
    setDraft("");
  };
  const id = `terms-${label.toLowerCase().replace(/\W+/g, "-")}`;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 id={id} className="text-base font-semibold">
            {label}
            {terms.length > 0 && <span className="ml-2 text-sm font-normal text-muted-foreground">{terms.length}</span>}
          </h3>
          {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
        </div>
        {headerAction}
      </div>

      {collapsible && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Find in ${label.toLowerCase()}`}
            aria-label={`Find in ${label}`}
            className="h-9 pl-8 text-sm"
          />
        </div>
      )}

      <ul aria-labelledby={id} className="flex flex-wrap gap-2">
        {shown.map((term) => (
          <li key={term}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm",
                tone === "more" ? "border-border bg-muted/40 text-foreground" : "border-dashed border-border text-muted-foreground",
              )}
            >
              {term}
              <button type="button" onClick={() => onRemove(term)} className="rounded-full p-1 hover:bg-muted" aria-label={`Remove ${term}`}>
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
        {terms.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet</li>}
        {query && shown.length === 0 && <li className="text-sm text-muted-foreground">No match</li>}
      </ul>

      {collapsible && !query && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          {showAll ? "Show fewer" : `Show all ${terms.length}`}
          {!showAll && hidden > 0 && <span className="sr-only"> ({hidden} hidden)</span>}
        </button>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder={placeholder ?? "Add a word or phrase"}
          aria-label={`Add to ${label}`}
          className="h-10"
        />
        <Button type="button" variant="outline" onClick={commit} disabled={!draft.trim()} className="h-10 gap-1">
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add
        </Button>
      </div>
      <p aria-live="polite" className={cn("text-sm text-muted-foreground", !notice && "sr-only")}>{notice ?? ""}</p>
      {children}
    </div>
  );
}
