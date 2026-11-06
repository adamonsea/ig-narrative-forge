import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

type CuratrLogoProps = ComponentPropsWithoutRef<'span'> & {
  iconOnly?: boolean;
  iconClassName?: string;
};

export function CuratrLogo({ className, iconOnly = false, iconClassName, ...props }: CuratrLogoProps) {
  return (
    <span
      className={cn('inline-flex items-center font-logo font-medium leading-none', className)}
      aria-label="Curatr.pro"
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 148.99 148.37"
        className={cn('h-[1.05em] w-auto shrink-0 text-[#57FFB9]', !iconOnly && 'mr-[0.32em]', iconClassName)}
      >
        <path d="M0,71.47h39.08c1.51-16.97,15.28-30.42,32.4-31.42V0c-18.95,0-37.14,7.54-50.54,20.93C7.54,34.33,0,52.53,0,71.47Z" fill="currentColor" />
        <path d="M39.02,76.89H0c0,18.95,7.54,37.14,20.93,50.54,13.4,13.4,31.59,20.93,50.54,20.93v-39.25c-17.39-1.02-31.32-14.88-32.46-32.23Z" fill="currentColor" />
        <path d="M77.52,108.95v39.42h0c39.47,0,71.47-32,71.47-71.47h0s-40.95,0-40.95,0c-1.1,16.71-14.05,30.17-30.53,32.06Z" fill="currentColor" />
        <path d="M77.52,0h0c0,39.47,32,71.47,71.47,71.47h0V0h-71.47Z" fill="currentColor" />
      </svg>
      {!iconOnly && (
        <span aria-hidden="true" className="inline-flex items-baseline">
          <span>Curatr</span>
          <span className="text-[#57FFB9]">.</span>
          <span className="text-[0.48em]">pro</span>
        </span>
      )}
    </span>
  );
}