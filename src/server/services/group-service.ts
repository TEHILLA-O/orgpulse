import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCorrelationId } from '@/lib/correlation';
import { ConflictError, NotFoundError } from '@/lib/errors';
import type { Actor } from '@/domain/permissions/policy';
import { loadOrgGroups } from '@/repositories/org-repository';
import { assertWritable, isDemoMode } from '@/demo/mode';
import { demoMemberships } from '@/demo/northstar';

export const CreateGroupBody = z.object({
  name: z.string().min(2).max(80),
  kind: z.enum(['COHORT', 'GOVERNANCE', 'FUNCTION', 'TEAM']).default('TEAM'),
  colour: z.string().max(16).optional().nullable(),
  description: z.string().max(400).optional().nullable(),
});

export async function listGroups(organisationId: string) {
  const groups = await loadOrgGroups(organisationId);
  if (isDemoMode()) {
    const countById = new Map<string, number>();
    for (const row of demoMemberships) {
      countById.set(row.groupId, (countById.get(row.groupId) ?? 0) + 1);
    }
    return groups.map((group) => ({
      ...group,
      memberCount: countById.get(group.id) ?? 0,
    }));
  }
  const counts = await prisma.personGroupMembership.groupBy({
    by: ['groupId'],
    where: { organisationId },
    _count: { personId: true },
  });
  const countById = new Map(counts.map((row) => [row.groupId, row._count.personId]));
  return groups.map((group) => ({
    ...group,
    memberCount: countById.get(group.id) ?? 0,
  }));
}

export async function createGroup(input: {
  organisationId: string;
  actor: Actor;
  body: z.infer<typeof CreateGroupBody>;
}) {
  assertWritable();
  const slug = slugify(input.body.name);
  const existing = await prisma.orgGroup.findFirst({
    where: { organisationId: input.organisationId, slug, deletedAt: null },
  });
  if (existing) {
    throw new ConflictError('A group with that name already exists.');
  }

  const group = await prisma.orgGroup.create({
    data: {
      organisationId: input.organisationId,
      name: input.body.name.trim(),
      slug,
      kind: input.body.kind,
      colour: input.body.colour ?? '#4c8dff',
      description: input.body.description ?? null,
      isSystem: false,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organisationId: input.organisationId,
      actorId: input.actor.userId,
      actorType: 'USER',
      action: 'CREATE',
      entityType: 'OrgGroup',
      entityId: group.id,
      newState: { name: group.name, kind: group.kind },
      source: 'LOCAL',
      correlationId: getCorrelationId(),
    },
  });

  return group;
}

export async function setPersonGroups(input: {
  organisationId: string;
  personId: string;
  groupIds: string[];
}) {
  assertWritable();
  const person = await prisma.person.findFirst({
    where: { id: input.personId, organisationId: input.organisationId, deletedAt: null },
  });
  if (!person) throw new NotFoundError('Person not found.');

  const groups = await prisma.orgGroup.findMany({
    where: { organisationId: input.organisationId, id: { in: input.groupIds }, deletedAt: null },
  });

  await prisma.$transaction([
    prisma.personGroupMembership.deleteMany({
      where: { organisationId: input.organisationId, personId: input.personId },
    }),
    prisma.personGroupMembership.createMany({
      data: groups.map((group) => ({
        organisationId: input.organisationId,
        personId: input.personId,
        groupId: group.id,
      })),
    }),
  ]);
}

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}
