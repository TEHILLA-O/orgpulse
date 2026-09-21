'use client';

export function ChartLegend() {
  const items = [
    { label: 'Filled seat', swatch: 'bg-brand' },
    { label: 'Open role', swatch: 'border border-dashed border-caution bg-caution/15' },
    { label: 'Department colour', swatch: 'bg-signal' },
    { label: 'Dotted line', swatch: 'border-t-2 border-dashed border-signal bg-transparent h-0 w-6 mt-2' },
  ];

  return (
    <div className="page-enter pointer-events-none absolute bottom-4 left-4 z-10 rounded-2xl border border-white/15 bg-raised/80 px-3.5 py-2.5 text-white shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur-xl no-print">
      <p className="text-[10px] font-semibold text-[var(--muted-foreground)]">Legend</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-[11px]">
            <span className={['h-2.5 w-2.5 shrink-0 rounded-full', item.swatch].join(' ')} />
            {item.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
