import { cn } from '@/lib/utils';

export function Card({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-white/15 bg-[var(--card)] p-5 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[transform,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-0.5 hover:border-white/25 hover:shadow-[0_22px_56px_rgba(0,0,0,0.4)]',
        className,
      )}
      {...props}
    />
  );
}
