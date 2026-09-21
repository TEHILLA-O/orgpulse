'use client';

import * as SheetPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Sheet = SheetPrimitive.Root;
export const SheetTrigger = SheetPrimitive.Trigger;

export function SheetContent({
  className,
  children,
  side = 'right',
  ...props
}: SheetPrimitive.DialogContentProps & { side?: 'right' | 'left' }) {
  return (
    <SheetPrimitive.Portal>
      <SheetPrimitive.Overlay className="motion-overlay fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" />
      <SheetPrimitive.Content
        className={cn(
          'fixed z-50 flex h-full w-[min(26rem,100%)] flex-col border-white/12 bg-sunken/94 text-white shadow-[0_20px_60px_rgba(0,0,0,0.45)] backdrop-blur-xl',
          side === 'right'
            ? 'motion-sheet-right top-0 right-0 rounded-l-3xl border-l'
            : 'motion-sheet-left top-0 left-0 rounded-r-3xl border-r',
          className,
        )}
        {...props}
      >
        <SheetPrimitive.Close className="absolute top-3 right-3 rounded-full p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-white">
          <X className="h-4 w-4" />
        </SheetPrimitive.Close>
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}
