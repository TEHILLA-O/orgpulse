import { describe, expect, it } from 'vitest';
import { mapRipplingWorker } from './map-worker';

describe('mapRipplingWorker', () => {
  it('maps expanded worker fields to a directory person', () => {
    const person = mapRipplingWorker({
      id: 'w-1',
      status: 'ACTIVE',
      work_email: 'ada@omni.example',
      title: 'Staff engineer',
      start_date: '2022-04-01',
      manager_id: 'w-ceo',
      department: { name: 'Engineering' },
      work_location: { name: 'London' },
      employment_type: { label: 'Full-time' },
      user: {
        name: {
          display_name: 'Ada Lovelace',
          preferred_given_name: 'Ada',
          family_name: 'Lovelace',
        },
      },
    });

    expect(person).toMatchObject({
      externalId: 'w-1',
      displayName: 'Ada Lovelace',
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@omni.example',
      jobTitle: 'Staff engineer',
      department: 'Engineering',
      officeLocation: 'London',
      managerExternalId: 'w-ceo',
      employmentType: 'Full-time',
    });
  });

  it('skips terminated workers and records without ids', () => {
    expect(mapRipplingWorker({ id: 'w-2', status: 'TERMINATED', work_email: 'gone@omni.example' })).toBeNull();
    expect(mapRipplingWorker({ work_email: 'no-id@omni.example' })).toBeNull();
  });
});
