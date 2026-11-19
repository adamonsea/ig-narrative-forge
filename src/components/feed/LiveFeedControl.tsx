import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ExternalLink, MoreHorizontal } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface LiveFeedControlProps {
  isLive: boolean;
  feedName: string;
  feedPath: string;
  onChange: (live: boolean) => void | Promise<void>;
}

/**
 * The feed's live status in the Desk header.
 * Live: a bright mint "Live" link to the public feed; taking it offline sits behind a
 * quiet menu and a confirm box that says nothing is lost.
 * Draft: a quiet Draft pill and one "Go live" button.
 */
export function LiveFeedControl({ isLive, feedName, feedPath, onChange }: LiveFeedControlProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async (live: boolean) => {
    setBusy(true);
    try {
      await onChange(live);
    } finally {
      setBusy(false);
    }
  };

  if (!isLive) {
    return (
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-muted px-3 py-1 text-sm text-muted-foreground">Draft</span>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-11 w-11" asChild>
              <Link to={feedPath} target="_blank" aria-label="Preview feed">
                <ExternalLink className="h-4 w-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Preview feed</TooltipContent>
        </Tooltip>
        <Button onClick={() => run(true)} disabled={busy}>Go live</Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Link
        to={feedPath}
        target="_blank"
        aria-label={`${feedName} is live. Open the feed`}
        className="group inline-flex h-11 items-center gap-2 rounded-full bg-mint pl-4 pr-3 text-base font-semibold text-pop-foreground shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-bright focus-visible:ring-offset-2"
      >
        <span className="live-pulse live-pulse-light h-2.5 w-2.5 shrink-0 rounded-full bg-mint-foreground" aria-hidden="true" />
        Live
        <ArrowUpRight className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
      </Link>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-11 w-11 text-muted-foreground" aria-label="Feed options">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Feed options</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem className="text-base" onSelect={() => setConfirmOpen(true)}>
            Take offline…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg">Take {feedName} offline?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-base text-muted-foreground">
                <p>Readers won't be able to open the feed until you go live again.</p>
                <ul className="list-disc space-y-1 pl-5">
                  <li>Nothing is deleted: stories, sources, subscribers and settings all stay.</li>
                  <li>Automatic gathering pauses while it's offline.</li>
                  <li>Go live again any time from here.</li>
                </ul>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className={`${buttonVariants()} border-primary`}>Keep live</AlertDialogCancel>
            <AlertDialogAction
              className={`${buttonVariants({ variant: "outline" })} text-foreground`}
              onClick={() => run(false)}
            >
              Take offline
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
