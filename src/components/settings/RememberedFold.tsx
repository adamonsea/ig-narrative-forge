import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

const storageKey = (userId: string | undefined, foldKey: string) => `curatr:fold:${userId ?? "anon"}:${foldKey}`;

/** Opens a remembered fold for this owner (e.g. from a deep link). */
export function openFold(userId: string | undefined, foldKey: string) {
  try {
    window.localStorage.setItem(storageKey(userId, foldKey), "1");
    window.dispatchEvent(new CustomEvent("curatr:fold", { detail: foldKey }));
  } catch {
    /* ignore */
  }
}

/**
 * "More options" / "Extras": folded by default, and remembered per owner —
 * once someone opens it, it stays open for them next time.
 */
export function RememberedFold({
  foldKey,
  label,
  description,
  children,
  className,
  variant = "inline",
}: {
  foldKey: string;
  label: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "inline" | "section";
}) {
  const { user } = useAuth();
  const key = storageKey(user?.id, foldKey);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      setOpen(window.localStorage.getItem(key) === "1");
    } catch {
      setOpen(false);
    }
    const onOpen = (e: Event) => {
      if ((e as CustomEvent).detail === foldKey) setOpen(true);
    };
    window.addEventListener("curatr:fold", onOpen);
    return () => window.removeEventListener("curatr:fold", onOpen);
  }, [key, foldKey]);

  const toggle = (next: boolean) => {
    setOpen(next);
    try {
      if (next) window.localStorage.setItem(key, "1");
      else window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };

  return (
    <Collapsible open={open} onOpenChange={toggle} className={className}>
      <CollapsibleTrigger
        className={cn(
          "group flex w-full items-center gap-2 text-left transition-colors",
          variant === "section"
            ? "justify-between py-2"
            : "py-1 text-sm font-medium text-muted-foreground hover:text-foreground",
        )}
      >
        {variant === "section" ? (
          <>
            <span>
              <span className="block display-heading text-xl md:text-2xl">{label}</span>
              {description && <span className="mt-1 block text-sm text-muted-foreground">{description}</span>}
            </span>
            <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </>
        ) : (
          <>
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
            {label}
          </>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent className="animate-in fade-in-0 slide-in-from-top-1 duration-200">
        <div className={variant === "section" ? "pt-6" : "pt-5"}>{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
