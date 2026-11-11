import newsroomBusy from '@/assets/newsroom-busy.webp.asset.json';

/**
 * Full-width newsroom photo backdrop for a section, with the hero's purple
 * multiply treatment. Sits absolutely behind the section's content; the
 * parent section needs `relative`. Fades into the page navy top and bottom
 * so it reads as part of the page, not a panel.
 *
 * `overlayClass` swaps the tint for sections whose text needs more contrast;
 * it must keep `mix-blend-multiply` so the photo still reads through it.
 */
export const NewsroomBand = ({
  overlayClass = 'bg-[hsl(270,100%,68%)] mix-blend-multiply',
}: {
  overlayClass?: string;
} = {}) => (
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden"
    style={{ isolation: 'isolate' }}
  >
    <div
      className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-[0.18]"
      style={{ backgroundImage: `url(${newsroomBusy.url})` }}
    />
    <div className={`absolute inset-0 mix-blend-multiply ${overlayClass}`} />
    <div className="absolute inset-x-0 top-0 h-[30%] bg-gradient-to-b from-[hsl(214,50%,9%)] to-transparent" />
    <div className="absolute inset-x-0 bottom-0 h-[30%] bg-gradient-to-b from-transparent to-[hsl(214,50%,9%)]" />
  </div>
);
