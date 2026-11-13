import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { addTerm } from "@/lib/feedSetup";
import { cn } from "@/lib/utils";

/** An editable list of plain words: tap × to remove, type and press Enter to add. */
export function TermList({
  label,
  hint,
  terms,
  onChange,
  tone = "more",
  placeholder,
}: {
  label: string;
  hint?: string;
  terms: string[];
  onChange: (next: string[]) => void;
  tone?: "more" | "less";
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft.split(",").map((p) => p.trim()).filter(Boolean);
    if (parts.length === 0) return;
    onChange(parts.reduce((acc, p) => addTerm(acc, p), terms));
    setDraft("");
  };
  const id = `terms-${label.toLowerCase().replace(/\W+/g, "-")}`;
  return (
    <div className="space-y-3">
      <div>
        <h3 id={id} className="text-base font-semibold">{label}</h3>
        {hint && <p className="mt-0.5 text-sm text-muted-foreground">{hint}</p>}
      </div>
      <ul aria-labelledby={id} className="flex flex-wrap gap-2">
        {terms.map((term) => (
          <li key={term}>
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border py-1 pl-3 pr-1 text-sm",
                tone === "more" ? "border-border bg-muted/40 text-foreground" : "border-dashed border-border text-muted-foreground",
              )}
            >
              {term}
              <button
                type="button"
                onClick={() => onChange(terms.filter((t) => t !== term))}
                className="rounded-full p-1 hover:bg-muted"
                aria-label={`Remove ${term}`}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
        {terms.length === 0 && <li className="text-sm text-muted-foreground">Nothing yet</li>}
      </ul>
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
    </div>
  );
}
