import type { OrgRole } from '@prisma/client';
import type { ImportField } from '@/domain/import/columns';
import { detectPrimaryCycle } from '@/domain/org/cycle';
import type {
  AssignmentSnapshot,
  PersonSnapshot,
  PositionSnapshot,
  RelationshipSnapshot,
} from '@/domain/org/types';

export const DEMO_ORG_ID = '11111111-1111-4111-a111-111111111111';
export const DEMO_USER_ID = '22222222-2222-4222-a222-222222222222';

const now = new Date('2026-03-01T00:00:00.000Z');

const dept = {
  exec: { id: 'd-exec', name: 'Executive Office', code: 'EXEC', colour: '#a78bfa', parentDepartmentId: null },
  fin: { id: 'd-fin', name: 'Finance', code: 'FIN', colour: '#3dd68c', parentDepartmentId: null },
  ppl: { id: 'd-ppl', name: 'People & Culture', code: 'PPL', colour: '#f2b33d', parentDepartmentId: null },
  tech: { id: 'd-tech', name: 'Technology', code: 'TECH', colour: '#38bdf8', parentDepartmentId: null },
  ops: { id: 'd-ops', name: 'Operations', code: 'OPS', colour: '#2dd4bf', parentDepartmentId: null },
  com: { id: 'd-com', name: 'Commercial', code: 'COM', colour: '#fb7185', parentDepartmentId: null },
};

const loc = {
  london: { id: 'l-lon', name: 'London HQ', country: 'United Kingdom', city: 'London' },
  manchester: { id: 'l-man', name: 'Manchester', country: 'United Kingdom', city: 'Manchester' },
};

const groups = [
  { id: 'g-emp', name: 'Employees', slug: 'employees', kind: 'COHORT', colour: '#4c8dff', description: 'Everyone on the payroll', isSystem: true, sortOrder: 0, organisationId: DEMO_ORG_ID, createdAt: now, updatedAt: now, deletedAt: null },
  { id: 'g-board', name: 'Leadership', slug: 'leadership', kind: 'GOVERNANCE', colour: '#a78bfa', description: 'Executive team', isSystem: false, sortOrder: 1, organisationId: DEMO_ORG_ID, createdAt: now, updatedAt: now, deletedAt: null },
];

interface Seat {
  key: string;
  title: string;
  departmentId: string;
  locationId: string;
  managerKey: string | null;
  firstName: string;
  lastName: string;
  vacant?: boolean;
  skills?: string[];
}

const seats: Seat[] = [
  { key: 'ceo', title: 'Chief Executive Officer', departmentId: dept.exec.id, locationId: loc.london.id, managerKey: null, firstName: 'Amelia', lastName: 'Shah', skills: ['Leadership'] },
  { key: 'ea', title: 'Executive Assistant to the CEO', departmentId: dept.exec.id, locationId: loc.london.id, managerKey: 'ceo', firstName: 'Harriet', lastName: 'Cole' },
  { key: 'cfo', title: 'Chief Financial Officer', departmentId: dept.fin.id, locationId: loc.london.id, managerKey: 'ceo', firstName: 'Noah', lastName: 'Adeyemi', skills: ['Finance'] },
  { key: 'cpo', title: 'Chief People Officer', departmentId: dept.ppl.id, locationId: loc.london.id, managerKey: 'ceo', firstName: 'Priya', lastName: 'Raman', skills: ['People operations'] },
  { key: 'cto', title: 'Chief Technology Officer', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'ceo', firstName: 'Daniel', lastName: 'Okonkwo', skills: ['Engineering leadership', 'TypeScript'] },
  { key: 'coo', title: 'Chief Operating Officer', departmentId: dept.ops.id, locationId: loc.london.id, managerKey: 'ceo', firstName: 'Sophie', lastName: 'Lindqvist', skills: ['Operations'] },
  { key: 'cco', title: 'Chief Commercial Officer', departmentId: dept.com.id, locationId: loc.london.id, managerKey: 'ceo', firstName: 'Mateo', lastName: 'Alvarez', skills: ['Sales'] },
  { key: 'eng', title: 'Head of Engineering', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'cto', firstName: 'Kwame', lastName: 'Boateng', skills: ['TypeScript', 'React'] },
  { key: 'data', title: 'Head of Data', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'cto', firstName: 'Isla', lastName: 'Murray', skills: ['Data', 'Python'] },
  { key: 'prod', title: 'Head of Product', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'cto', firstName: 'Theo', lastName: 'Bennett', skills: ['Product'] },
  { key: 'talent', title: 'Head of Talent', departmentId: dept.ppl.id, locationId: loc.manchester.id, managerKey: 'cpo', firstName: 'Elena', lastName: 'Rossi' },
  { key: 'ctrl', title: 'Group Financial Controller', departmentId: dept.fin.id, locationId: loc.london.id, managerKey: 'cfo', firstName: 'James', lastName: 'Whitaker', skills: ['Finance'] },
  { key: 'ic1', title: 'Senior Engineer', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'eng', firstName: 'Mei', lastName: 'Tan', skills: ['TypeScript', 'Next.js'] },
  { key: 'ic2', title: 'Data Scientist', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'data', firstName: 'Omar', lastName: 'Hassan', skills: ['Python', 'Data'] },
  { key: 'ic3', title: 'Product Designer', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'prod', firstName: 'Freya', lastName: 'Campbell', skills: ['Design'] },
  { key: 'vac1', title: 'Staff Engineer', departmentId: dept.tech.id, locationId: loc.london.id, managerKey: 'eng', firstName: 'Open', lastName: 'Role', vacant: true },
];

function id(kind: 'pos' | 'per' | 'asg' | 'rel', key: string) {
  const head = { pos: 'aa', per: 'bb', asg: 'cc', rel: 'dd' }[kind].repeat(4);
  const hex = [...key]
    .map((char) => char.charCodeAt(0).toString(16).padStart(2, '0'))
    .join('')
    .padEnd(12, '0')
    .slice(0, 12);
  return `${head}-0000-4000-a000-${hex}`;
}

export const demoDepartments = Object.values(dept);
export const demoLocations = Object.values(loc);
export const demoGroups = groups;

export const demoPeople: Array<PersonSnapshot & { bio: string | null; employeeId: string; skills: string[] }> = [];
export const demoPositions: PositionSnapshot[] = [];
export const demoAssignments: AssignmentSnapshot[] = [];
export const demoRelationships: RelationshipSnapshot[] = [];
export const demoMemberships: Array<{ personId: string; groupId: string }> = [];

for (const seat of seats) {
  const positionId = id('pos', seat.key);
  const personId = id('per', seat.key);
  demoPositions.push({
    id: positionId,
    title: seat.title,
    code: `POS-${seat.key.toUpperCase()}`,
    departmentId: seat.departmentId,
    locationId: seat.locationId,
    positionType: seat.key === 'ea' ? 'ASSISTANT' : 'SINGLE',
    employmentType: 'FULL_TIME',
    status: seat.vacant ? 'VACANT' : 'ACTIVE',
    sortOrder: null,
  });
  if (!seat.vacant) {
    demoPeople.push({
      id: personId,
      displayName: `${seat.firstName} ${seat.lastName}`,
      preferredName: null,
      firstName: seat.firstName,
      lastName: seat.lastName,
      email: `${seat.firstName}.${seat.lastName}@northstar.example`.toLowerCase(),
      phone: null,
      profilePhotoUrl: `https://i.pravatar.cc/128?u=${seat.key}`,
      status: 'ACTIVE',
      holidayRemainingDays: 18,
      groupIds: seat.managerKey === null || ['cfo', 'cpo', 'cto', 'coo', 'cco'].includes(seat.key) ? [groups[0]!.id, groups[1]!.id] : [groups[0]!.id],
      bio: `${seat.firstName} holds ${seat.title} at Omni.`,
      employeeId: `NST-${seat.key.toUpperCase()}`,
      skills: seat.skills ?? [],
    });
    demoAssignments.push({
      id: id('asg', seat.key),
      personId,
      positionId,
      isPrimary: true,
      allocationPercentage: 100,
      assignmentType: 'PERMANENT',
      startDate: now,
      endDate: null,
    });
    demoMemberships.push({ personId, groupId: groups[0]!.id });
    if (seat.managerKey === null || ['cfo', 'cpo', 'cto', 'coo', 'cco'].includes(seat.key)) {
      demoMemberships.push({ personId, groupId: groups[1]!.id });
    }
  }
  if (seat.managerKey) {
    demoRelationships.push({
      id: id('rel', seat.key),
      subordinatePositionId: positionId,
      managerPositionId: id('pos', seat.managerKey),
      relationshipType: 'PRIMARY',
      isPrimary: true,
    });
  }
}

export let demoCeo = demoPeople.find((person) => person.displayName === 'Amelia Shah')!;

export function demoSession() {
  const role: OrgRole = 'OWNER';
  return {
    userId: DEMO_USER_ID,
    email: 'owner@northstar.example',
    organisationId: DEMO_ORG_ID,
    role,
    actor: {
      userId: DEMO_USER_ID,
      organisationId: DEMO_ORG_ID,
      role,
      isPlatformAdmin: false,
    },
  };
}

export function demoGraph() {
  return {
    positions: demoPositions,
    people: demoPeople,
    assignments: demoAssignments,
    relationships: demoRelationships,
    departments: demoDepartments,
    locations: demoLocations,
  };
}

export function demoChart() {
  return {
    id: 'chart-northstar',
    organisationId: DEMO_ORG_ID,
    name: 'Omni — Company',
    isDefault: true,
    deletedAt: null,
    configuration: { collapsedPositionIds: [] as string[], showSecondaryLines: true },
  };
}

export function demoOrganisation() {
  return {
    id: DEMO_ORG_ID,
    name: 'Omni',
    slug: 'northstar',
    timezone: 'Europe/London',
    settings: {},
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
}

export function demoPeopleRows() {
  const deptById = new Map(demoDepartments.map((item) => [item.id, item]));
  const locById = new Map(demoLocations.map((item) => [item.id, item]));
  const groupById = new Map(demoGroups.map((item) => [item.id, item]));
  return demoPeople.map((person) => {
    const assignment = demoAssignments.find((row) => row.personId === person.id);
    const position = assignment ? demoPositions.find((row) => row.id === assignment.positionId) : undefined;
    return {
      id: person.id,
      displayName: person.displayName,
      email: person.email,
      profilePhotoUrl: person.profilePhotoUrl,
      profileLinkUrl: null,
      assignments: assignment && position
        ? [
            {
              position: {
                id: position.id,
                title: position.title,
                department: position.departmentId ? deptById.get(position.departmentId) ?? null : null,
                location: position.locationId ? locById.get(position.locationId) ?? null : null,
              },
            },
          ]
        : [],
      groupMemberships: (person.groupIds ?? []).map((groupId) => ({ group: groupById.get(groupId)! })),
      skills: person.skills.map((name, index) => ({
        skill: { id: `skill-${person.id}-${index}`, name },
        source: 'TITLE',
      })),
    };
  });
}

export function demoDirectory() {
  const rows = demoPeopleRows();
  return {
    people: rows.map((person) => ({
      id: person.id,
      displayName: person.displayName,
      email: person.email,
      title: person.assignments[0]?.position.title ?? null,
      department: person.assignments[0]?.position.department?.name ?? null,
      location: person.assignments[0]?.position.location?.name ?? null,
      skills: person.skills.map((row) => ({ name: row.skill.name, source: row.source })),
      sources: ['LOCAL'],
    })),
    sources: [
      { id: 'conn-ms', provider: 'MICROSOFT_MOCK', name: 'Microsoft 365 (mock)', status: 'CONNECTED', lastSyncAt: now, config: { mode: 'mock' } },
      { id: 'conn-sb', provider: 'SUPABASE', name: 'Supabase directory (mock)', status: 'CONNECTED', lastSyncAt: now, config: { mode: 'mock' } },
    ],
  };
}

export function demoSkillsCatalogue() {
  const counts = new Map<string, number>();
  for (const person of demoPeople) {
    for (const name of person.skills) {
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([name, personCount], index) => ({
    id: `skill-cat-${index}`,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    personCount,
  }));
}

export function demoPersonSkills(personId: string) {
  const person = demoPeople.find((item) => item.id === personId);
  return (person?.skills ?? []).map((name, index) => ({
    id: `${personId}-ps-${index}`,
    skillId: `${personId}-sk-${index}`,
    name,
    source: 'TITLE',
    evidence: 'Demo',
    locked: false,
  }));
}

const demoObjectiveState = [
  {
    id: 'obj-1',
    organisationId: DEMO_ORG_ID,
    title: 'Make the live directory the default way to find people',
    description: 'Skills, connectors, and the org chart stay in one workspace.',
    cycleLabel: 'H2 2026',
    status: 'ACTIVE',
    ownerPerson: { id: demoCeo.id, displayName: demoCeo.displayName },
    keyResults: [
      { id: 'kr-1', title: 'Directory sources connected', unit: 'count', currentValue: 3, targetValue: 4, startValue: 0 },
      { id: 'kr-2', title: 'Leadership seats with at least one skill tag', unit: '%', currentValue: 80, targetValue: 100, startValue: 0 },
    ],
  },
];

export function demoObjectives() {
  return demoObjectiveState;
}

export function demoConnectors() {
  return [
    {
      id: 'conn-ms',
      provider: 'MICROSOFT_MOCK',
      name: 'Microsoft 365 (mock)',
      status: 'CONNECTED',
      isReadOnly: true,
      lastSyncAt: now.toISOString(),
      lastSuccessfulSyncAt: now.toISOString(),
      mode: 'mock' as const,
      identityCount: demoPeople.length,
      hasCredentials: false,
      recentJobs: [{ id: 'job-1', status: 'COMPLETED', mode: 'APPLY', createdCount: demoPeople.length, updatedCount: 0, finishedAt: now.toISOString() }],
    },
    {
      id: 'conn-sb',
      provider: 'SUPABASE',
      name: 'Supabase directory (mock)',
      status: 'CONNECTED',
      isReadOnly: true,
      lastSyncAt: now.toISOString(),
      lastSuccessfulSyncAt: now.toISOString(),
      mode: 'mock' as const,
      identityCount: 0,
      hasCredentials: false,
      recentJobs: [],
    },
    {
      id: 'conn-rp',
      provider: 'RIPPLING',
      name: 'Rippling',
      status: 'NOT_CONFIGURED',
      isReadOnly: true,
      lastSyncAt: null,
      lastSuccessfulSyncAt: null,
      mode: 'mock' as const,
      identityCount: 0,
      hasCredentials: false,
      recentJobs: [],
    },
  ];
}

export function demoDashboard() {
  const occupied = new Set(demoAssignments.map((row) => row.positionId));
  const vacantPositions = demoPositions.filter((position) => !occupied.has(position.id)).length;
  return {
    organisationName: 'Omni',
    people: demoPeople.length,
    positions: demoPositions.length,
    vacantPositions,
    departments: demoDepartments.length,
    locations: demoLocations.length,
    changesThisMonth: 1,
    lastSync: null,
    lastSuccessfulSync: { finishedAt: now, status: 'COMPLETED' },
    connector: { name: 'Microsoft 365 (mock)', status: 'CONNECTED', provider: 'MICROSOFT_MOCK' },
    recentAudit: [
      {
        id: 'audit-1',
        action: 'SYNC_APPLIED',
        entityType: 'Organisation',
        createdAt: now,
        actor: { name: 'Amelia Shah', email: 'owner@northstar.example' },
      },
    ],
  };
}

export function demoPersonRecord(personId: string) {
  const person = demoPeople.find((item) => item.id === personId);
  if (!person) return null;
  return {
    ...person,
    bio: person.bio,
    profileLinkUrl: null,
    profileLinkUsername: null,
    profileLinkProvider: null,
    employeeId: person.employeeId,
    startDate: now,
    holidayAllowanceDays: 25,
    holidayRemainingDays: 18,
    costCentre: 'NST-100',
    workingPattern: 'Mon–Fri, 09:00–17:30',
    ftePercent: 100,
    nextReviewDate: new Date('2026-09-01'),
    probationEndDate: null,
    contractEndDate: null,
    noticePeriodDays: 90,
  };
}

export function demoMembers() {
  return [
    {
      id: 'mem-1',
      role: 'OWNER',
      user: { id: DEMO_USER_ID, email: 'owner@northstar.example', name: 'Amelia Shah', lastLoginAt: now },
    },
  ];
}

export function demoPositionsList() {
  const deptById = new Map(demoDepartments.map((item) => [item.id, item]));
  const locById = new Map(demoLocations.map((item) => [item.id, item]));
  const peopleById = new Map(demoPeople.map((item) => [item.id, item]));
  return demoPositions.map((position) => {
    const assignments = demoAssignments
      .filter((row) => row.positionId === position.id)
      .map((row) => ({
        person: {
          displayName: peopleById.get(row.personId)?.displayName ?? 'Unknown',
        },
      }));
    return {
      id: position.id,
      title: position.title,
      status: position.status,
      positionType: position.positionType,
      department: position.departmentId ? deptById.get(position.departmentId) ?? null : null,
      location: position.locationId ? locById.get(position.locationId) ?? null : null,
      assignments,
    };
  });
}

export function demoDepartmentDetail(departmentId: string) {
  const department = demoDepartments.find((item) => item.id === departmentId);
  if (!department) return null;
  const locById = new Map(demoLocations.map((item) => [item.id, item]));
  const peopleById = new Map(demoPeople.map((item) => [item.id, item]));
  const positions = demoPositions.filter((position) => position.departmentId === department.id);
  const people = positions.flatMap((position) =>
    demoAssignments
      .filter((row) => row.positionId === position.id)
      .map((row) => {
        const person = peopleById.get(row.personId);
        return {
          personId: row.personId,
          displayName: person?.displayName ?? 'Unknown',
          email: person?.email ?? null,
          profilePhotoUrl: person?.profilePhotoUrl ?? null,
          holidayRemainingDays: person?.holidayRemainingDays ?? null,
          positionId: position.id,
          title: position.title,
          location: position.locationId ? locById.get(position.locationId)?.name ?? null : null,
          isPrimary: row.isPrimary,
        };
      }),
  );
  const vacant = positions
    .filter((position) => !demoAssignments.some((row) => row.positionId === position.id))
    .map((position) => ({
      positionId: position.id,
      title: position.title,
      location: position.locationId ? locById.get(position.locationId)?.name ?? null : null,
    }));
  const headPosition =
    positions.find((position) => {
      const rel = demoRelationships.find((row) => row.subordinatePositionId === position.id && row.isPrimary);
      if (!rel) return true;
      const manager = demoPositions.find((item) => item.id === rel.managerPositionId);
      return manager?.departmentId !== department.id;
    }) ?? null;
  const headAssignment = headPosition
    ? demoAssignments.find((row) => row.positionId === headPosition.id)
    : undefined;
  return {
    department,
    head: headPosition
      ? {
          positionId: headPosition.id,
          title: headPosition.title,
          personName: headAssignment
            ? (peopleById.get(headAssignment.personId)?.displayName ?? 'Vacant')
            : 'Vacant',
        }
      : null,
    people,
    vacant,
    totals: {
      positions: positions.length,
      people: people.length,
      vacant: vacant.length,
    },
  };
}

function demoUid() {
  return crypto.randomUUID();
}

function refreshDemoCeo() {
  const root =
    demoPeople.find((person) => {
      const assignment = demoAssignments.find((row) => row.personId === person.id);
      if (!assignment) return true;
      return !demoRelationships.some((rel) => rel.subordinatePositionId === assignment.positionId);
    }) ?? demoPeople[0];
  if (root) demoCeo = root;
}

export function applyDemoImport(
  rows: Array<{ raw: Record<string, string>; status: string }>,
  replaceExisting: boolean,
) {
  if (replaceExisting) {
    demoPeople.length = 0;
    demoPositions.length = 0;
    demoAssignments.length = 0;
    demoRelationships.length = 0;
    demoMemberships.length = 0;
    demoDepartments.length = 0;
    demoLocations.length = 0;
  }

  const peopleByEmail = new Map(
    demoPeople.filter((person) => person.email).map((person) => [person.email!.toLowerCase(), person]),
  );
  const peopleByName = new Map(demoPeople.map((person) => [person.displayName.toLowerCase(), person]));
  const deptByName = new Map(demoDepartments.map((item) => [item.name.toLowerCase(), item]));
  const locByName = new Map(demoLocations.map((item) => [item.name.toLowerCase(), item]));
  const positionByPersonId = new Map<string, string>();
  for (const assignment of demoAssignments) {
    positionByPersonId.set(assignment.personId, assignment.positionId);
  }
  const liveEdges = demoRelationships
    .filter((rel) => rel.isPrimary)
    .map((rel) => ({
      subordinatePositionId: rel.subordinatePositionId,
      managerPositionId: rel.managerPositionId,
    }));

  let createdCount = 0;
  let updatedCount = 0;
  let errorCount = 0;
  const created: Array<{ personId: string; positionId: string; values: Record<ImportField, string> }> = [];

  for (const row of rows) {
    if (row.status !== 'NEW') continue;
    const values = row.raw as Record<ImportField, string>;
    try {
      const email = values.email?.toLowerCase() || null;
      const displayName =
        values.displayName ||
        [values.firstName, values.lastName].filter(Boolean).join(' ') ||
        email ||
        'Imported person';
      const [firstName, ...rest] = displayName.split(' ');
      const lastName = values.lastName || rest.join(' ') || firstName || 'Unknown';

      let departmentId: string | null = null;
      if (values.department) {
        const existing = deptByName.get(values.department.toLowerCase());
        if (existing) {
          departmentId = existing.id;
        } else {
          const createdDept = {
            id: demoUid(),
            name: values.department,
            code: values.department.slice(0, 8).toUpperCase(),
            colour: '#4c8dff',
            parentDepartmentId: null,
          };
          demoDepartments.push(createdDept);
          deptByName.set(values.department.toLowerCase(), createdDept);
          departmentId = createdDept.id;
        }
      }

      let locationId: string | null = null;
      if (values.location) {
        const existing = locByName.get(values.location.toLowerCase());
        if (existing) {
          locationId = existing.id;
        } else {
          const createdLoc = {
            id: demoUid(),
            name: values.location,
            country: '',
            city: values.location,
          };
          demoLocations.push(createdLoc);
          locByName.set(values.location.toLowerCase(), createdLoc);
          locationId = createdLoc.id;
        }
      }

      let person = email ? peopleByEmail.get(email) : peopleByName.get(displayName.toLowerCase());
      if (!person) {
        person = {
          id: demoUid(),
          displayName,
          preferredName: null,
          firstName: values.firstName || firstName || 'Imported',
          lastName,
          email,
          phone: null,
          profilePhotoUrl: `https://i.pravatar.cc/128?u=${email || displayName}`,
          status: 'ACTIVE',
          holidayRemainingDays: 18,
          groupIds: [groups[0]!.id],
          bio: null,
          employeeId: values.employeeId || `IMP-${demoPeople.length + 1}`,
          skills: [],
        };
        demoPeople.push(person);
        if (email) peopleByEmail.set(email, person);
        peopleByName.set(displayName.toLowerCase(), person);
        demoMemberships.push({ personId: person.id, groupId: groups[0]!.id });
        createdCount += 1;
      } else {
        updatedCount += 1;
      }

      let positionId = positionByPersonId.get(person.id);
      if (!positionId) {
        const position: PositionSnapshot = {
          id: demoUid(),
          title: values.title,
          code: null,
          departmentId,
          locationId,
          positionType: 'SINGLE',
          employmentType: 'FULL_TIME',
          status: 'ACTIVE',
          sortOrder: null,
        };
        demoPositions.push(position);
        demoAssignments.push({
          id: demoUid(),
          personId: person.id,
          positionId: position.id,
          isPrimary: true,
          allocationPercentage: 100,
          assignmentType: 'PERMANENT',
          startDate: now,
          endDate: null,
        });
        positionId = position.id;
        positionByPersonId.set(person.id, position.id);
      }

      created.push({ personId: person.id, positionId, values });
    } catch {
      errorCount += 1;
    }
  }

  const reportingToWrite: Array<{ subordinatePositionId: string; managerPositionId: string }> = [];
  for (const item of created) {
    const managerPerson =
      (item.values.managerEmail ? peopleByEmail.get(item.values.managerEmail.toLowerCase()) : undefined) ??
      (item.values.managerName ? peopleByName.get(item.values.managerName.toLowerCase()) : undefined);
    const managerPositionId = managerPerson ? positionByPersonId.get(managerPerson.id) : undefined;
    if (!managerPositionId || managerPositionId === item.positionId) continue;
    const candidate = { subordinatePositionId: item.positionId, managerPositionId };
    const cycle = detectPrimaryCycle([...liveEdges, ...reportingToWrite], candidate);
    if (cycle.cyclic) {
      errorCount += 1;
      continue;
    }
    reportingToWrite.push(candidate);
  }

  for (const edge of reportingToWrite) {
    const existingIndex = demoRelationships.findIndex(
      (rel) => rel.subordinatePositionId === edge.subordinatePositionId && rel.isPrimary,
    );
    if (existingIndex >= 0) {
      if (demoRelationships[existingIndex]?.managerPositionId === edge.managerPositionId) continue;
      demoRelationships.splice(existingIndex, 1);
    }
    demoRelationships.push({
      id: demoUid(),
      subordinatePositionId: edge.subordinatePositionId,
      managerPositionId: edge.managerPositionId,
      relationshipType: 'PRIMARY',
      isPrimary: true,
    });
  }

  refreshDemoCeo();
  return { createdCount, updatedCount, errorCount };
}

