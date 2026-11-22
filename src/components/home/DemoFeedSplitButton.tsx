import { ArrowRight, ChevronDown } from 'lucide-react';
import { Link } from '@/lib/router-compat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/** Live demo feeds shown from the home page; the first is the main button's target. */
export const DEMO_FEEDS = [
  { label: 'Town news', to: '/feed/eastbourne' },
  { label: 'UK city list', to: '/feed/brighton-list' },
  { label: 'EU city list', to: '/feed/whats-on-lisbon' },
] as const;

/** Split button: "Live demo feed" opens town news; the chevron lists every demo feed. */
export function DemoFeedSplitButton() {
  const [main] = DEMO_FEEDS;
  return (
    <div className="flex items-center gap-1 text-white/80">
      <Link to={main.to} className="group flex items-center gap-3 transition-all hover:text-white">
        <span className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-white/5 transition-all group-hover:border-shop-violet group-hover:bg-shop-violet/10">
          <ArrowRight className="h-4 w-4 text-white transition-colors group-hover:text-shop-violet" aria-hidden="true" />
        </span>
        <span className="text-lg font-medium">Live demo feed</span>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Choose a demo feed"
          className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-shop-mint data-[state=open]:bg-white/10 data-[state=open]:text-white"
        >
          <ChevronDown className="h-5 w-5" aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={8}
          className="min-w-[13rem] rounded-2xl border-white/10 bg-shop-ink-deep p-2 text-white shadow-2xl"
        >
          {DEMO_FEEDS.map((feed) => (
            <DropdownMenuItem
              key={feed.to}
              asChild
              className="cursor-pointer rounded-xl px-4 py-3 text-lg text-white/80 focus:bg-white/10 focus:text-white"
            >
              <Link to={feed.to} className="flex items-center justify-between gap-4">
                {feed.label}
                <ArrowRight className="h-4 w-4 text-shop-mint" aria-hidden="true" />
              </Link>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
