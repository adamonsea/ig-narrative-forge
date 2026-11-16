import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { AutopilotBasics } from "@/components/settings/AutopilotBasics";

/** The news pipeline's settings, one tap from the Story pool: Autopilot and pace, with the rest in Settings. */
export function HappenedSettings({ topicId }: { topicId: string }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" aria-label="News settings">
          <Settings2 className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full space-y-6 overflow-y-auto sm:max-w-md" onOpenAutoFocus={(e) => { e.preventDefault(); (e.currentTarget as HTMLElement).focus(); }}>
        <SheetHeader className="text-left">
          <SheetTitle className="text-xl">News</SheetTitle>
        </SheetHeader>
        {open && <AutopilotBasics topicId={topicId} />}
        <Button variant="outline" asChild onClick={() => setOpen(false)}>
          <Link to={`${pathname}?tab=settings&section=automation`}>All news settings</Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
