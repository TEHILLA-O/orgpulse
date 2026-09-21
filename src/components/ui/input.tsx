import * as React from 'react';
import { cn } from '@/lib/utils';

export function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'flex h-10 w-full rounded-full border border-white/12 bg-white/8 px-3 text-sm text-white outline-none placeholder:text-[var(--muted-foreground)] transition-[border-color,box-shadow,background-color] duration-200 focus-visible:border-[var(--primary)] focus-visible:bg-white/12 focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:shadow-[0_0_0_4px_rgba(76,141,255,0.18)]',
        className,
      )}
      {...props}
    />
  );
}
