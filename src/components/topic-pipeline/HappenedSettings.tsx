import { opt } from "@/lib/optionalProps";
import { useState } from "react";
import { Link, useLocation } from "@/lib/router-compat";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AutopilotBasics } from "@/components/settings/AutopilotBasics";

/** The news pipeline's settings, one tap from the Story pool: Autopilot and pace, with the rest in Settings. */
export function HappenedSettings({ topicId, onChanged }: { topicId: string; onChanged?: () => void }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="News settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="panel" className="w-full space-y-6 overflow-y-auto sm:max-w-md" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <SheetHeader className="text-left">
          <SheetTitle className="text-lg">News</SheetTitle>
        </SheetHeader>
        {open && <AutopilotBasics topicId={topicId} {...opt("onChanged", onChanged)} />}
        <Button variant="outline" asChild onClick={() => setOpen(false)}>
          <Link to={`${pathname}/settings/autopilot`}>All news settings</Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
