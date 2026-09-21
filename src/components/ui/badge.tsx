import { cn } from '@/lib/utils';

export function Badge({
  className,
  tone = 'default',
  ...props
}: React.ComponentProps<'span'> & { tone?: 'default' | 'gold' | 'vacant' | 'sea' }) {
  const tones = {
    default: 'bg-white/10 text-white',
    gold: 'bg-signal/20 text-signal-soft',
    vacant: 'bg-caution/18 text-caution-soft',
    sea: 'bg-brand/20 text-brand-hi',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase transition-transform duration-200 hover:scale-105',
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
