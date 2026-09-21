import { AppShell } from '@/components/layout/app-shell';
import { DatabaseSetup } from '@/components/layout/database-setup';
import { requireOrgContext } from '@/server/auth/session';
import { isDemoMode } from '@/demo/mode';
import { prisma } from '@/lib/db';
import { demoOrganisation, demoSession } from '@/demo/northstar';
import { displayCompanyName } from '@/lib/utils';

export const dynamic = 'force-dynamic';

export default async function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  try {
    const ctx = await requireOrgContext(undefined, 'org:read');
    const organisation = isDemoMode()
      ? demoOrganisation()
      : await prisma.organisation.findFirst({
          where: { id: ctx.organisationId, deletedAt: null },
          select: { name: true },
        });
    return (
      <AppShell
        userEmail={ctx.email}
        role={ctx.role}
        demo={isDemoMode()}
        organisationName={displayCompanyName(organisation?.name)}
      >
        {children}
      </AppShell>
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not load the organisation.';
    const localUnreachable = /127\.0\.0\.1|localhost|Can't reach database/i.test(message);
    if (localUnreachable) {
      const guest = demoSession();
      return (
        <AppShell userEmail={guest.email} role={guest.role} demo organisationName="Omni">
          {children}
        </AppShell>
      );
    }
    return <DatabaseSetup message={message} />;
  }
}
