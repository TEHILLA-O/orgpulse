/**
 * Idempotent demo seed for Omni.
 *
 * Generates a realistic organisation: 1 CEO, 5 executives, an executive
 * assistant, 20 managers, 123 individual contributors (150 people), 8
 * departments, 5 locations, 10 vacancies, dotted-line reports, a job-share
 * and a dual assignment. Records carry MICROSOFT_MOCK provenance.
 */
import 'dotenv/config';
import { createHash } from 'node:crypto';
import { hash } from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const FIRST_NAMES = [
  'Amelia', 'Noah', 'Priya', 'Daniel', 'Sophie', 'Mateo', 'Harriet', 'James',
  'Aisha', 'Callum', 'Elena', 'Omar', 'Freya', 'Kwame', 'Isla', 'Luca',
  'Nia', 'Theo', 'Yara', 'Ben', 'Mei', 'Owen', 'Sana', 'Hugo',
  'Leila', 'Patrick', 'Zara', 'Finn', 'Anika', 'George', 'Hana', 'Idris',
  'Clara', 'Ravi', 'Maja', 'Seth', 'Dina', 'Arthur', 'Noor', 'Felix',
];

const LAST_NAMES = [
  'Shah', 'Adeyemi', 'Raman', 'Okonkwo', 'Lindqvist', 'Alvarez', 'Cole', 'Whitaker',
  'Khan', 'MacLeod', 'Rossi', 'Hassan', 'Campbell', 'Boateng', 'Murray', 'Bianchi',
  'Okeke', 'Bennett', 'Farouk', 'Hughes', 'Tan', 'Doyle', 'Qureshi', 'Berg',
  'Nasser', 'Keane', 'Rahman', 'Walsh', 'Desai', 'Foster', 'Nakamura', 'Bakker',
  'Petrov', 'Singh', 'Novak', 'Okafor', 'Costa', 'Reid', 'Malik', 'Vogel',
];

const IC_TITLES = [
  'Analyst', 'Senior Analyst', 'Specialist', 'Coordinator', 'Advisor',
  'Associate', 'Senior Associate', 'Lead', 'Principal', 'Manager',
];

interface NamedPerson {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  employeeId: string;
}

function nameAt(index: number): NamedPerson {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length]!;
  const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length]!;
  const displayName = `${firstName} ${lastName}`;
  const email = `${firstName}.${lastName}${index > 39 ? index : ''}@northstar.example`.toLowerCase();
  return {
    firstName,
    lastName,
    displayName,
    email,
    employeeId: `NST-${String(index + 1).padStart(4, '0')}`,
  };
}

function hashOf(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function portraitFor(seed: string): string {
  const n = parseInt(hashOf(seed).slice(0, 8), 16);
  const gender = n % 2 === 0 ? 'women' : 'men';
  return `https://randomuser.me/api/portraits/${gender}/${n % 99}.jpg`;
}

function holidayFor(seed: string, allowanceDays = 25) {
  let used = 0;
  for (let i = 0; i < seed.length; i += 1) {
    used = (used + seed.charCodeAt(i) * 13) % 16;
  }
  return { allowanceDays, remainingDays: Math.max(0, allowanceDays - used) };
}

function nextReviewFrom(startDate: Date, now = new Date()) {
  const review = new Date(startDate);
  review.setFullYear(review.getFullYear() + 1);
  while (review < now) {
    review.setFullYear(review.getFullYear() + 1);
  }
  return review;
}

async function wipeOrganisation(organisationId: string) {
  await prisma.chartPresence.deleteMany({ where: { organisationId } });
  await prisma.keyResult.deleteMany({ where: { objective: { organisationId } } });
  await prisma.objective.deleteMany({ where: { organisationId } });
  await prisma.personSkill.deleteMany({ where: { organisationId } });
  await prisma.skill.deleteMany({ where: { organisationId } });
  await prisma.personGroupMembership.deleteMany({ where: { organisationId } });
  await prisma.orgGroup.deleteMany({ where: { organisationId } });
  await prisma.auditEvent.deleteMany({ where: { organisationId } });
  await prisma.shareLink.deleteMany({ where: { organisationId } });
  await prisma.chart.deleteMany({ where: { organisationId } });
  await prisma.scenarioChange.deleteMany({
    where: { scenario: { organisationId } },
  });
  await prisma.scenario.deleteMany({ where: { organisationId } });
  await prisma.snapshot.deleteMany({ where: { organisationId } });
  await prisma.syncRecord.deleteMany({ where: { syncJob: { organisationId } } });
  await prisma.syncJob.deleteMany({ where: { organisationId } });
  await prisma.fieldMapping.deleteMany({ where: { connector: { organisationId } } });
  await prisma.connector.deleteMany({ where: { organisationId } });
  await prisma.fieldProvenance.deleteMany({ where: { organisationId } });
  await prisma.customFieldValue.deleteMany({
    where: { definition: { organisationId } },
  });
  await prisma.customFieldDefinition.deleteMany({ where: { organisationId } });
  await prisma.importRow.deleteMany({ where: { importJob: { organisationId } } });
  await prisma.importJob.deleteMany({ where: { organisationId } });
  await prisma.externalIdentity.deleteMany({ where: { organisationId } });
  await prisma.reportingRelationship.deleteMany({ where: { organisationId } });
  await prisma.assignment.deleteMany({ where: { organisationId } });
  await prisma.department.updateMany({ where: { organisationId }, data: { headPositionId: null } });
  await prisma.position.deleteMany({ where: { organisationId } });
  await prisma.person.deleteMany({ where: { organisationId } });
  await prisma.department.deleteMany({ where: { organisationId } });
  await prisma.location.deleteMany({ where: { organisationId } });
  await prisma.organisationMembership.deleteMany({ where: { organisationId } });
  await prisma.organisation.delete({ where: { id: organisationId } });
}

async function main() {
  const existing = await prisma.organisation.findUnique({ where: { slug: 'northstar' } });
  if (existing) {
    await wipeOrganisation(existing.id);
  }

  const passwordHash = await hash('OrgPulse!dev', 10);
  const now = new Date('2024-03-01T00:00:00Z');

  const organisation = await prisma.organisation.create({
    data: {
      name: 'Omni',
      slug: 'northstar',
      timezone: 'Europe/London',
      settings: {
        demo: true,
        assistant: { privacyReviewComplete: true, modelConnected: false },
      },
    },
  });

  const users = await Promise.all(
    [
      { email: 'owner@northstar.example', name: 'Amelia Shah', role: 'OWNER' as const },
      { email: 'admin@northstar.example', name: 'Daniel Okonkwo', role: 'ADMIN' as const },
      { email: 'editor@northstar.example', name: 'Harriet Cole', role: 'EDITOR' as const },
      { email: 'viewer@northstar.example', name: 'James Whitaker', role: 'VIEWER' as const },
    ].map((item) =>
      prisma.user.upsert({
        where: { email: item.email },
        update: { passwordHash, name: item.name },
        create: { email: item.email, name: item.name, passwordHash },
      }).then(async (user) => {
        await prisma.organisationMembership.create({
          data: {
            userId: user.id,
            organisationId: organisation.id,
            role: item.role,
            acceptedAt: new Date(),
          },
        });
        return user;
      }),
    ),
  );

  const owner = users[0]!;

  const locations = await prisma.location.createManyAndReturn({
    data: [
      { organisationId: organisation.id, name: 'London HQ', country: 'United Kingdom', city: 'London', address: '12 Bishopsgate', timezone: 'Europe/London', latitude: 51.5145, longitude: -0.0833 },
      { organisationId: organisation.id, name: 'Manchester', country: 'United Kingdom', city: 'Manchester', address: 'Spinningfields', timezone: 'Europe/London', latitude: 53.478, longitude: -2.248 },
      { organisationId: organisation.id, name: 'Edinburgh', country: 'United Kingdom', city: 'Edinburgh', address: 'St Andrew Square', timezone: 'Europe/London', latitude: 55.954, longitude: -3.192 },
      { organisationId: organisation.id, name: 'Dublin', country: 'Ireland', city: 'Dublin', address: 'Grand Canal Dock', timezone: 'Europe/Dublin', latitude: 53.342, longitude: -6.239 },
      { organisationId: organisation.id, name: 'Singapore', country: 'Singapore', city: 'Singapore', address: 'Raffles Place', timezone: 'Asia/Singapore', latitude: 1.284, longitude: 103.851 },
    ],
  });

  const loc = {
    london: locations[0]!,
    manchester: locations[1]!,
    edinburgh: locations[2]!,
    dublin: locations[3]!,
    singapore: locations[4]!,
  };

  const departments = await prisma.department.createManyAndReturn({
    data: [
      { organisationId: organisation.id, name: 'Executive Office', code: 'EXEC', colour: '#7c3aed' },
      { organisationId: organisation.id, name: 'Finance', code: 'FIN', colour: '#22d3ee' },
      { organisationId: organisation.id, name: 'People & Culture', code: 'PPL', colour: '#e879f9' },
      { organisationId: organisation.id, name: 'Technology', code: 'TECH', colour: '#6366f1' },
      { organisationId: organisation.id, name: 'Operations', code: 'OPS', colour: '#8b5cf6' },
      { organisationId: organisation.id, name: 'Commercial', code: 'COM', colour: '#ec4899' },
      { organisationId: organisation.id, name: 'Legal & Risk', code: 'LEG', colour: '#a78bfa' },
      { organisationId: organisation.id, name: 'Customer Experience', code: 'CX', colour: '#67e8f9' },
    ],
  });

  const dept = {
    exec: departments[0]!,
    fin: departments[1]!,
    ppl: departments[2]!,
    tech: departments[3]!,
    ops: departments[4]!,
    com: departments[5]!,
    leg: departments[6]!,
    cx: departments[7]!,
  };

  const costCentreByDept = new Map([
    [dept.exec.id, 'CC-100 Executive'],
    [dept.fin.id, 'CC-200 Finance'],
    [dept.ppl.id, 'CC-300 People'],
    [dept.tech.id, 'CC-400 Technology'],
    [dept.ops.id, 'CC-500 Operations'],
    [dept.com.id, 'CC-600 Commercial'],
    [dept.leg.id, 'CC-700 Legal'],
    [dept.cx.id, 'CC-800 Customer'],
  ]);

  let nameIndex = 0;
  const peopleByKey = new Map<string, { id: string; email: string; displayName: string }>();
  const positionsByKey = new Map<string, string>();

  async function addPerson(
    key: string,
    title: string,
    departmentId: string,
    locationId: string,
    managerKey: string | null,
    options?: { type?: 'SINGLE' | 'SHARED' | 'ASSISTANT'; vacant?: boolean; person?: NamedPerson },
  ) {
    const named = options?.person ?? nameAt(nameIndex++);
    const partTime = !options?.vacant && nameIndex % 17 === 0;
    let personId: string | undefined;
    if (!options?.vacant) {
      const startDate = new Date(2018 + (nameIndex % 7), nameIndex % 12, 1 + (nameIndex % 27));
      const leave = holidayFor(named.employeeId);
      const leadershipRole = /Chief|Head of|Director|General Counsel|Treasurer/.test(title);
      const probationEnd = new Date(startDate);
      probationEnd.setMonth(probationEnd.getMonth() + 6);
      const person = await prisma.person.create({
        data: {
          organisationId: organisation.id,
          firstName: named.firstName,
          lastName: named.lastName,
          displayName: named.displayName,
          email: named.email,
          phone: `+44 20 7946 ${String(1000 + nameIndex).slice(-4)}`,
          status: 'ACTIVE',
          startDate,
          employeeId: named.employeeId,
          profilePhotoUrl: portraitFor(named.employeeId),
          holidayAllowanceDays: leave.allowanceDays,
          holidayRemainingDays: leave.remainingDays,
          costCentre: costCentreByDept.get(departmentId) ?? 'CC-000',
          workingPattern: nameIndex % 11 === 0 ? 'Nine-day fortnight' : 'Mon–Fri, 09:00–17:30',
          ftePercent: partTime ? 80 : 100,
          nextReviewDate: nextReviewFrom(startDate),
          probationEndDate: probationEnd > new Date() ? probationEnd : null,
          noticePeriodDays: leadershipRole ? 90 : 30,
        },
      });
      personId = person.id;
      peopleByKey.set(key, { id: person.id, email: person.email!, displayName: person.displayName });
    }

    const position = await prisma.position.create({
      data: {
        organisationId: organisation.id,
        title,
        code: `POS-${key.toUpperCase()}`,
        departmentId,
        locationId,
        positionType: options?.type ?? 'SINGLE',
        status: options?.vacant ? 'VACANT' : 'ACTIVE',
        employmentType: partTime ? 'PART_TIME' : 'FULL_TIME',
      },
    });
    positionsByKey.set(key, position.id);

    if (personId) {
      await prisma.assignment.create({
        data: {
          organisationId: organisation.id,
          personId,
          positionId: position.id,
          startDate: now,
          isPrimary: true,
          allocationPercentage: options?.type === 'SHARED' ? 50 : 100,
        },
      });
    }

    if (managerKey) {
      const managerId = positionsByKey.get(managerKey);
      if (!managerId) throw new Error(`Unknown manager ${managerKey} for ${key}`);
      await prisma.reportingRelationship.create({
        data: {
          organisationId: organisation.id,
          subordinatePositionId: position.id,
          managerPositionId: managerId,
          relationshipType: 'PRIMARY',
          isPrimary: true,
        },
      });
    }

    const identityTarget = personId
      ? { personId, entityType: 'PERSON' as const, externalId: `entra-${named.employeeId}` }
      : { positionId: position.id, entityType: 'POSITION' as const, externalId: `entra-pos-${key}` };

    await prisma.externalIdentity.create({
      data: {
        organisationId: organisation.id,
        provider: 'MICROSOFT_MOCK',
        lastSeenAt: new Date(),
        syncHash: hashOf(`${title}:${named.email}`),
        ...identityTarget,
      },
    });

    if (personId) {
      await prisma.externalIdentity.create({
        data: {
          organisationId: organisation.id,
          provider: 'RIPPLING',
          lastSeenAt: new Date(),
          syncHash: hashOf(`rippling:${named.employeeId}`),
          personId,
          entityType: 'PERSON',
          externalId: `rippling-${named.employeeId}`,
        },
      });
    }

    if (personId) {
      await prisma.fieldProvenance.create({
        data: {
          organisationId: organisation.id,
          entityType: 'Position',
          entityId: position.id,
          fieldName: 'title',
          source: 'MICROSOFT_MOCK',
          lastSyncedAt: new Date(),
        },
      });
    }

    return position.id;
  }

  const leadership: Array<[string, string, string, string, string | null, NamedPerson?]> = [
    ['ceo', 'Chief Executive Officer', dept.exec.id, loc.london.id, null, nameAt(0)],
    ['ea', 'Executive Assistant to the CEO', dept.exec.id, loc.london.id, 'ceo', nameAt(6)],
    ['cfo', 'Chief Financial Officer', dept.fin.id, loc.london.id, 'ceo', nameAt(1)],
    ['cpo', 'Chief People Officer', dept.ppl.id, loc.london.id, 'ceo', nameAt(2)],
    ['cto', 'Chief Technology Officer', dept.tech.id, loc.london.id, 'ceo', nameAt(3)],
    ['coo', 'Chief Operating Officer', dept.ops.id, loc.london.id, 'ceo', nameAt(4)],
    ['cco', 'Chief Commercial Officer', dept.com.id, loc.london.id, 'ceo', nameAt(5)],
  ];
  nameIndex = 7;

  for (const [key, title, departmentId, locationId, manager, person] of leadership) {
    await addPerson(key, title, departmentId, locationId, manager, {
      type: key === 'ea' ? 'ASSISTANT' : 'SINGLE',
      person,
    });
  }

  const managers: Array<[string, string, string, string, string]> = [
    ['fin-ctrl', 'Group Financial Controller', dept.fin.id, loc.london.id, 'cfo'],
    ['fin-fpa', 'Head of FP&A', dept.fin.id, loc.london.id, 'cfo'],
    ['fin-treas', 'Treasurer', dept.fin.id, loc.dublin.id, 'cfo'],
    ['ppl-talent', 'Head of Talent', dept.ppl.id, loc.london.id, 'cpo'],
    ['ppl-ops', 'Head of People Operations', dept.ppl.id, loc.manchester.id, 'cpo'],
    ['ppl-learn', 'Head of Learning', dept.ppl.id, loc.london.id, 'cpo'],
    ['tech-eng', 'Head of Engineering', dept.tech.id, loc.london.id, 'cto'],
    ['tech-data', 'Head of Data', dept.tech.id, loc.london.id, 'cto'],
    ['tech-it', 'Head of IT', dept.tech.id, loc.manchester.id, 'cto'],
    ['tech-sec', 'Head of Security', dept.tech.id, loc.london.id, 'cto'],
    ['tech-prod', 'Head of Product', dept.tech.id, loc.london.id, 'cto'],
    ['ops-fac', 'Head of Facilities', dept.ops.id, loc.london.id, 'coo'],
    ['ops-proc', 'Head of Procurement', dept.ops.id, loc.manchester.id, 'coo'],
    ['leg-gc', 'General Counsel', dept.leg.id, loc.london.id, 'coo'],
    ['com-sales', 'Head of Sales', dept.com.id, loc.london.id, 'cco'],
    ['com-mkt', 'Head of Marketing', dept.com.id, loc.london.id, 'cco'],
    ['com-part', 'Head of Partnerships', dept.com.id, loc.singapore.id, 'cco'],
    ['cx-dir', 'Director of Customer Experience', dept.cx.id, loc.london.id, 'cco'],
    ['cx-sup', 'Head of Support', dept.cx.id, loc.edinburgh.id, 'cx-dir'],
    ['cx-succ', 'Head of Success', dept.cx.id, loc.dublin.id, 'cx-dir'],
  ];

  for (const row of managers) {
    await addPerson(...row);
  }

  const icTeams: Array<[string, string, string, string, number]> = [
    ['fin-ctrl', 'Finance Analyst', dept.fin.id, loc.london.id, 7],
    ['fin-fpa', 'FP&A Analyst', dept.fin.id, loc.london.id, 6],
    ['fin-treas', 'Treasury Analyst', dept.fin.id, loc.dublin.id, 4],
    ['ppl-talent', 'Talent Partner', dept.ppl.id, loc.london.id, 6],
    ['ppl-ops', 'People Operations Specialist', dept.ppl.id, loc.manchester.id, 5],
    ['ppl-learn', 'Learning Designer', dept.ppl.id, loc.london.id, 4],
    ['tech-eng', 'Software Engineer', dept.tech.id, loc.london.id, 16],
    ['tech-data', 'Data Engineer', dept.tech.id, loc.london.id, 8],
    ['tech-it', 'IT Engineer', dept.tech.id, loc.manchester.id, 6],
    ['tech-sec', 'Security Engineer', dept.tech.id, loc.london.id, 5],
    ['tech-prod', 'Product Manager', dept.tech.id, loc.london.id, 6],
    ['ops-fac', 'Facilities Coordinator', dept.ops.id, loc.london.id, 5],
    ['ops-proc', 'Procurement Specialist', dept.ops.id, loc.manchester.id, 5],
    ['leg-gc', 'Legal Counsel', dept.leg.id, loc.london.id, 5],
    ['com-sales', 'Account Executive', dept.com.id, loc.london.id, 10],
    ['com-mkt', 'Marketing Specialist', dept.com.id, loc.london.id, 6],
    ['com-part', 'Partnerships Manager', dept.com.id, loc.singapore.id, 5],
    ['cx-sup', 'Support Advisor', dept.cx.id, loc.edinburgh.id, 8],
    ['cx-succ', 'Customer Success Manager', dept.cx.id, loc.dublin.id, 6],
  ];

  let icCount = 0;
  const locationCycle = [loc.london.id, loc.manchester.id, loc.edinburgh.id, loc.dublin.id, loc.singapore.id];
  for (const [managerKey, title, departmentId, locationId, count] of icTeams) {
    for (let i = 0; i < count; i += 1) {
      const seniority = IC_TITLES[i % 5]!;
      const locId = i % 4 === 0 ? locationCycle[i % locationCycle.length]! : locationId;
      await addPerson(`${managerKey}-ic-${i}`, `${seniority} ${title.replace('Head of ', '').replace('Director of ', '')}`, departmentId, locId, managerKey);
      icCount += 1;
    }
  }

  const vacancies: Array<[string, string, string, string, string]> = [
    ['vac-eng-1', 'Staff Software Engineer', dept.tech.id, loc.london.id, 'tech-eng'],
    ['vac-eng-2', 'Platform Engineer', dept.tech.id, loc.manchester.id, 'tech-eng'],
    ['vac-data', 'Analytics Engineer', dept.tech.id, loc.london.id, 'tech-data'],
    ['vac-fin', 'Management Accountant', dept.fin.id, loc.london.id, 'fin-ctrl'],
    ['vac-fpa', 'Senior FP&A Analyst', dept.fin.id, loc.london.id, 'fin-fpa'],
    ['vac-sales', 'Enterprise Account Executive', dept.com.id, loc.singapore.id, 'com-sales'],
    ['vac-talent', 'Technical Recruiter', dept.ppl.id, loc.london.id, 'ppl-talent'],
    ['vac-cx', 'Support Team Lead', dept.cx.id, loc.edinburgh.id, 'cx-sup'],
    ['vac-legal', 'Regulatory Counsel', dept.leg.id, loc.london.id, 'leg-gc'],
    ['vac-prod', 'Product Designer', dept.tech.id, loc.london.id, 'tech-prod'],
  ];

  for (const [key, title, departmentId, locationId, manager] of vacancies) {
    await addPerson(key, title, departmentId, locationId, manager, { vacant: true });
  }

  const dotted: Array<[string, string, string]> = [
    ['tech-data', 'cfo', 'Finance governance'],
    ['tech-sec', 'leg-gc', 'Risk reporting'],
    ['leg-gc', 'ceo', 'Board access'],
  ];
  for (const [sub, mgr, label] of dotted) {
    await prisma.reportingRelationship.create({
      data: {
        organisationId: organisation.id,
        subordinatePositionId: positionsByKey.get(sub)!,
        managerPositionId: positionsByKey.get(mgr)!,
        relationshipType: 'DOTTED_LINE',
        isPrimary: false,
        label,
      },
    });
  }

  const dualPerson = peopleByKey.get('tech-prod-ic-0');
  if (dualPerson) {
    await prisma.assignment.create({
      data: {
        organisationId: organisation.id,
        personId: dualPerson.id,
        positionId: positionsByKey.get('ppl-learn')!,
        assignmentType: 'SECONDMENT',
        startDate: now,
        isPrimary: false,
        allocationPercentage: 20,
      },
    });
    await prisma.assignment.updateMany({
      where: { personId: dualPerson.id, isPrimary: true, organisationId: organisation.id },
      data: { allocationPercentage: 80 },
    });
  }

  await prisma.department.update({
    where: { id: dept.exec.id },
    data: { headPositionId: positionsByKey.get('ceo') },
  });
  await prisma.department.update({
    where: { id: dept.fin.id },
    data: { headPositionId: positionsByKey.get('cfo') },
  });
  await prisma.department.update({
    where: { id: dept.ppl.id },
    data: { headPositionId: positionsByKey.get('cpo') },
  });
  await prisma.department.update({
    where: { id: dept.tech.id },
    data: { headPositionId: positionsByKey.get('cto') },
  });
  await prisma.department.update({
    where: { id: dept.ops.id },
    data: { headPositionId: positionsByKey.get('coo') },
  });
  await prisma.department.update({
    where: { id: dept.com.id },
    data: { headPositionId: positionsByKey.get('cco') },
  });
  await prisma.department.update({
    where: { id: dept.leg.id },
    data: { headPositionId: positionsByKey.get('leg-gc') },
  });
  await prisma.department.update({
    where: { id: dept.cx.id },
    data: { headPositionId: positionsByKey.get('cx-dir') },
  });

  const groupDefs = [
    {
      slug: 'employees',
      name: 'Employees',
      kind: 'COHORT' as const,
      colour: '#22d3ee',
      description: 'Everyone currently occupying a seat.',
      keys: [...peopleByKey.keys()],
    },
    {
      slug: 'leadership',
      name: 'Leadership',
      kind: 'FUNCTION' as const,
      colour: '#7c3aed',
      description: 'Executive team.',
      keys: ['ceo', 'cfo', 'cpo', 'cto', 'coo', 'cco'],
    },
    {
      slug: 'board-of-directors',
      name: 'Board of directors',
      kind: 'GOVERNANCE' as const,
      colour: '#e879f9',
      description: 'Board-facing roles for governance charts.',
      keys: ['ceo', 'cfo', 'cpo', 'cto', 'coo', 'cco', 'leg-gc'],
    },
    {
      slug: 'operations-heads',
      name: 'Operations heads',
      kind: 'FUNCTION' as const,
      colour: '#8b5cf6',
      description: 'COO and operational heads of function.',
      keys: ['coo', 'ops-fac', 'ops-proc'],
    },
  ];

  for (const [index, def] of groupDefs.entries()) {
    const group = await prisma.orgGroup.create({
      data: {
        organisationId: organisation.id,
        name: def.name,
        slug: def.slug,
        kind: def.kind,
        colour: def.colour,
        description: def.description,
        isSystem: true,
        sortOrder: index,
      },
    });
    const memberIds = [...new Set(def.keys.map((key) => peopleByKey.get(key)?.id).filter(Boolean))] as string[];
    if (memberIds.length) {
      await prisma.personGroupMembership.createMany({
        data: memberIds.map((personId) => ({
          organisationId: organisation.id,
          personId,
          groupId: group.id,
        })),
      });
    }
  }

  const chart = await prisma.chart.create({
    data: {
      organisationId: organisation.id,
      name: 'Omni — Company',
      description: 'Default live organisation chart',
      rootPositionId: positionsByKey.get('ceo'),
      isDefault: true,
      createdById: owner.id,
      configuration: {
        create: {
          layoutDirection: 'TOP_DOWN',
          nodeStyle: 'STANDARD',
          showPhotos: true,
          showVacancies: true,
          showSecondaryLines: true,
          showDirectReportCount: true,
          showLocation: true,
        },
      },
    },
  });

  const snapshot = await prisma.snapshot.create({
    data: {
      organisationId: organisation.id,
      name: 'Baseline',
      description: 'Seeded live organisation',
      createdById: owner.id,
      source: 'SCENARIO_BASE',
      changeCount: 0,
      payload: { note: 'Reconstruct from live tables at capturedAt' },
    },
  });

  await prisma.scenario.create({
    data: {
      organisationId: organisation.id,
      name: '2027 Restructure',
      description: 'Planning sandbox — does not touch live data',
      baseSnapshotId: snapshot.id,
      createdById: owner.id,
    },
  });

  const connector = await prisma.connector.create({
    data: {
      organisationId: organisation.id,
      provider: 'MICROSOFT_MOCK',
      name: 'Microsoft 365 (mock)',
      status: 'CONNECTED',
      isReadOnly: true,
      lastSyncAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      config: { mode: 'mock', tenant: 'northstar-demo' },
    },
  });

  await prisma.connector.create({
    data: {
      organisationId: organisation.id,
      provider: 'RIPPLING',
      name: 'Rippling (mock)',
      status: 'CONNECTED',
      isReadOnly: true,
      lastSyncAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      config: { mode: 'mock' },
    },
  });

  await prisma.connector.create({
    data: {
      organisationId: organisation.id,
      provider: 'SUPABASE',
      name: 'Supabase directory (mock)',
      status: 'CONNECTED',
      isReadOnly: true,
      lastSyncAt: new Date(),
      lastSuccessfulSyncAt: new Date(),
      config: { mode: 'mock', table: 'people' },
    },
  });

  async function tagPerson(key: string, names: Array<{ name: string; source: 'TITLE' | 'MANUAL' | 'BIO' }>) {
    const person = peopleByKey.get(key);
    if (!person) return;
    for (const item of names) {
      const slug = item.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const skill = await prisma.skill.upsert({
        where: { organisationId_slug: { organisationId: organisation.id, slug } },
        update: { name: item.name },
        create: { organisationId: organisation.id, name: item.name, slug },
      });
      await prisma.personSkill.upsert({
        where: { personId_skillId: { personId: person.id, skillId: skill.id } },
        update: { source: item.source, locked: item.source === 'MANUAL' },
        create: {
          organisationId: organisation.id,
          personId: person.id,
          skillId: skill.id,
          source: item.source,
          evidence: `Seeded from ${item.source.toLowerCase()}`,
          locked: item.source === 'MANUAL',
        },
      });
    }
  }

  await tagPerson('ceo', [{ name: 'Leadership', source: 'TITLE' }]);
  await tagPerson('cfo', [{ name: 'Finance', source: 'TITLE' }]);
  await tagPerson('cpo', [{ name: 'People operations', source: 'TITLE' }]);
  await tagPerson('cto', [
    { name: 'Engineering leadership', source: 'TITLE' },
    { name: 'TypeScript', source: 'MANUAL' },
  ]);
  await tagPerson('coo', [{ name: 'Operations', source: 'TITLE' }]);

  const ceo = peopleByKey.get('ceo');
  await prisma.objective.create({
    data: {
      organisationId: organisation.id,
      title: 'Make the live directory the default way to find people',
      description: 'Skills, connectors, and the org chart stay in one workspace.',
      cycleLabel: 'H2 2026',
      status: 'ACTIVE',
      ownerPersonId: ceo?.id ?? null,
      createdById: owner.id,
      keyResults: {
        create: [
          { title: 'Directory sources connected', unit: 'count', startValue: 0, currentValue: 3, targetValue: 4 },
          { title: 'Leadership seats with at least one skill tag', unit: '%', startValue: 0, currentValue: 80, targetValue: 100 },
        ],
      },
    },
  });

  await prisma.syncJob.create({
    data: {
      organisationId: organisation.id,
      connectorId: connector.id,
      status: 'COMPLETED',
      trigger: 'MANUAL',
      mode: 'APPLY',
      correlationId: 'seed-sync-001',
      startedAt: new Date(Date.now() - 60_000),
      finishedAt: new Date(),
      createdCount: 150,
      updatedCount: 0,
      unchangedCount: 0,
      deactivatedCount: 0,
      errorCount: 0,
    },
  });

  await prisma.auditEvent.create({
    data: {
      organisationId: organisation.id,
      actorId: owner.id,
      actorType: 'SYSTEM',
      action: 'SYNC_APPLIED',
      entityType: 'Organisation',
      entityId: organisation.id,
      source: 'MICROSOFT_MOCK',
      correlationId: 'seed-sync-001',
      newState: { people: 150, vacancies: 10 },
    },
  });

  const personCount = await prisma.person.count({ where: { organisationId: organisation.id } });
  const positionCount = await prisma.position.count({ where: { organisationId: organisation.id } });
  const vacantCount = await prisma.position.count({
    where: { organisationId: organisation.id, status: 'VACANT' },
  });

  console.log(
    JSON.stringify(
      {
        organisation: organisation.slug,
        people: personCount,
        positions: positionCount,
        vacant: vacantCount,
        individualContributors: icCount,
        chart: chart.name,
        login: 'owner@northstar.example / OrgPulse!dev',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
