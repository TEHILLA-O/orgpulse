import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-[color,background-color,box-shadow,transform,border-color] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-px active:translate-y-0 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:pointer-events-none disabled:opacity-50 disabled:hover:translate-y-0',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--primary)] text-[var(--primary-foreground)] shadow-[0_8px_20px_rgba(76,141,255,0.18)] hover:bg-brand-hi hover:shadow-[0_12px_28px_rgba(76,141,255,0.32)]',
        secondary: 'bg-white/10 text-white hover:bg-white/15',
        outline: 'border border-white/30 bg-transparent text-white hover:border-white/50 hover:bg-white/10',
        ghost: 'text-white hover:bg-white/10',
        gold: 'bg-[var(--accent)] text-[var(--accent-foreground)] shadow-[0_8px_20px_rgba(167,139,250,0.2)] hover:bg-signal-hi hover:shadow-[0_12px_28px_rgba(167,139,250,0.32)]',
        destructive: 'bg-[var(--destructive)] text-white hover:bg-critical/80',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5 text-xs',
        lg: 'h-10 px-4',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
