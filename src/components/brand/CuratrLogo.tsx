import type { ComponentPropsWithoutRef } from 'react';
import { cn } from '@/lib/utils';

type CuratrLogoProps = ComponentPropsWithoutRef<'span'> & {
  iconOnly?: boolean;
};

export function CuratrLogo({ className, iconOnly = false, ...props }: CuratrLogoProps) {
  return (
    <span
      className={cn('inline-flex items-center font-logo font-medium leading-none', className)}
      aria-label="Curatr.pro"
      {...props}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 100 168"
        className={cn('h-[1.25em] w-auto shrink-0 text-pop', !iconOnly && 'mr-[0.38em]')}
      >
        <path d="M0 50A50 50 0 0 1 100 50H0Z" fill="currentColor" />
        <path d="M0 60H50V108H0Z" fill="currentColor" />
        <path d="M0 118H100A50 50 0 0 1 0 118Z" fill="currentColor" />
      </svg>
      {!iconOnly && (
        <span aria-hidden="true" className="inline-flex items-baseline">
          <span>Curatr</span>
          <span className="text-pop">.</span>
          <span className="text-[0.48em]">pro</span>
        </span>
      )}
    </span>
  );
}