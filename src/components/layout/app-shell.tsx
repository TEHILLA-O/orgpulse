'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { AppSidebar } from '@/components/layout/sidebar';
import { cn } from '@/lib/utils';

export function AppShell({
  children,
  userEmail,
  role,
  demo,
  organisationName = 'Omni',
}: {
  children: React.ReactNode;
  userEmail: string;
  role: string;
  demo?: boolean;
  organisationName?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const pathname = usePathname();
  const isChart = pathname.startsWith('/charts');

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      <AppSidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((value) => !value)}
        userEmail={userEmail}
        role={role}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {isChart ? null : (
          <header className="page-enter no-print flex h-14 shrink-0 items-center justify-between gap-4 px-6">
            <p className="text-sm text-[var(--muted-foreground)]">{organisationName}</p>
            {demo ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Hosted demo — in-memory data, changes are not saved
              </p>
            ) : null}
          </header>
        )}
        <main className={cn('min-h-0 flex-1 overflow-auto', isChart && 'overflow-hidden p-0')}>
          {isChart ? children : (
            <div key={pathname} className="page-enter px-6 pb-8">
              {children}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
